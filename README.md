# Gateway Teltonika para Budisa

Servicio Node.js sin dependencias de ejecución que recibe conexiones TCP de dispositivos Teltonika, decodifica Teltonika Codec 8 Extended (y Codec 8), envía cada paquete AVL como un batch firmado a Budisa y solo confirma al dispositivo cuando Render ha confirmado la persistencia de todos sus registros.

```text
FMC880/FTC887 -- TCP/Codec 8E --> Railway gateway -- HTTPS + HMAC --> Budisa /tracker --> BD
```

El gateway no tiene base de datos. La relación autoritativa `IMEI -> tracker -> camión`, la restricción UNIQUE de `eventId` y la persistencia pertenecen a Budisa.

## Garantías del diseño

- Un acumulador y estado independientes por socket procesan IMEI y frames aunque lleguen fragmentados, concatenados o byte a byte.
- Se valida preamble, longitud acotada, CRC-16/IBM, codec, límites de lectura y ambos contadores de registros.
- Codec 8E conserva todos los IO en `io.raw` y normaliza los AVL IDs FTC887 conocidos en `io.known`.
- `packetId = SHA256(frame completo)` y `eventId = SHA256(imei:packetId:índice)` son deterministas.
- Un ACK positivo UInt32BE solo se escribe tras `HTTP 2xx`, `ok: true` y `accepted === recordCount`.
- Un fallo de Render produce ACK cero y cierre, para que Teltonika conserve/reenvíe el batch.
- Railway a Render usa HTTPS y HMAC-SHA256 con hash del body exacto, timestamp y nonce.
- IMEIs duplicados reemplazan la conexión anterior. Hay timeout, keepalive, cierre limpio, logs JSON y métricas en memoria.

## Requisitos e instalación

Node.js 20 o posterior:

```bash
npm install
npm test
npm start
```

El proceso usa variables del entorno del sistema/Railway. `.env.example` es una plantilla, no se carga automáticamente. Nunca se debe versionar `.env`.

## Variables del gateway (Railway)

| Variable | Valor/recomendación |
|---|---|
| `NODE_ENV` | `production` |
| `TCP_PORT` | `5000` |
| `HEALTH_PORT` o `PORT` | `3000` (si existe `HEALTH_PORT`, tiene prioridad) |
| `TRACKER_MODEL` | `FMC880` para un FMC880; solo es metadato del payload |
| `EYE_SENSOR_BYTE_ORDER` | `big` (firmware EYE actual); use `little` solo con firmware EYE anterior que lo requiera |
| `RENDER_TRACKER_URL` | `https://budisa.onrender.com/tracker` |
| `TRACKER_KEY_ID` | `gateway-v1` |
| `TRACKER_SHARED_SECRET` | Secret aleatorio compartido, nunca `CHANGE_ME` |
| `ALLOWED_IMEIS` | Lista separada por comas; vacío acepta cualquier IMEI sintácticamente válido y genera warning |
| `RENDER_TIMEOUT_MS` | `5000` |
| `RENDER_MAX_RETRIES` | `2` (tres intentos totales) |
| `TCP_IDLE_TIMEOUT_MS` | `120000` |
| `MAX_AVL_DATA_LENGTH` | `4096` |
| `LOG_LEVEL` | `info`, `debug`, `warn` o `error` |
| `LOG_FULL_IMEI` | `false` recomendado |
| `LOG_RAW_PACKETS` | `false` recomendado |
| `ALLOW_INSECURE_RENDER_URL` | `false`; jamás se permite HTTP en producción |

El arranque falla si falta el secret, si vale `CHANGE_ME`, si los puertos/límites son inválidos o si Render no usa HTTPS. Genere el secret una vez y copie exactamente el mismo valor en Railway y Render:

```bash
openssl rand -hex 32
```

No aparece en logs ni en `/health`.

## Desarrollo local y prueba completa

Abra tres terminales. En PowerShell:

```powershell
# Terminal 1: Render simulado
$env:TRACKER_SHARED_SECRET='local-development-secret-at-least-32-bytes'
npm run mock-render

# Terminal 2: gateway
$env:NODE_ENV='development'
$env:TRACKER_SHARED_SECRET='local-development-secret-at-least-32-bytes'
$env:RENDER_TRACKER_URL='http://127.0.0.1:3001/tracker'
$env:ALLOW_INSECURE_RENDER_URL='true'
npm start

# Terminal 3: FTC887 simulado
npm run simulate
```

El resultado esperado es `IMEI response: 0x01 accepted` y `AVL ACK: 1 record(s)`. El simulador admite `SIMULATOR_HOST`, `SIMULATOR_PORT` y `SIMULATOR_IMEI`.

Compruebe observabilidad con `GET http://127.0.0.1:3000/health`. Devuelve uptime, conexiones activas, última entrega a Render y contadores; nunca IMEIs o secretos.

## Despliegue en Railway

1. Cree un servicio desde este repositorio y use Node.js 20+ con comando `npm start`.
2. Configure todas las variables de la tabla anterior y una allowlist en producción.
3. En **Settings → Networking → TCP Proxy**, cree un proxy al puerto interno **5000**.
4. Railway entregará, por ejemplo, `xxxx.proxy.rlwy.net:12345`. El host público y el puerto público son distintos del puerto interno.
5. Configure el healthcheck HTTP contra `/health` en el puerto web que Railway asigne mediante `PORT`, o defina `HEALTH_PORT=3000` según la configuración del servicio.

Un solo proceso sirve a todos los camiones; no se crea un proceso por dispositivo.

## FTC887 configuration

En Teltonika Configurator establezca exactamente:

```text
Domain:        xxxx.proxy.rlwy.net       (sin http:// ni https://)
Port:          12345                     (puerto público del TCP Proxy)
Protocol:      TCP
Data Protocol: Codec 8 Extended
TLS Encryption: None                     (solo en la primera validación)
```

El FTC887 habla TCP con Railway. Railway habla HTTPS con Render; son conexiones diferentes. Primero valide IMEI, codec, GPS, forwarding y ACK. Como fase posterior puede sustituirse la creación del servidor TCP por `tls.createServer()` sin tocar framing/parser. Para el tramo dispositivo-gateway también pueden estudiarse TLS soportado por Teltonika, APN privado o controles de SIM. El IMEI identifica el equipo pero no es autenticación criptográfica.

## Contrato enviado a Budisa

Se envía un POST por paquete, no por posición. Incluye `schemaVersion: 1`, source, dispositivo, hash del paquete y todos sus records. Si aparece AVL ID 641 se añade ICCID. Nunca se envía `truckId` como autoridad.

Headers:

```text
X-Tracker-Key-Id: gateway-v1
X-Tracker-Timestamp: <Unix seconds>
X-Tracker-Nonce: <UUID>
X-Tracker-Content-SHA256: <SHA256 hexadecimal del JSON exacto>
X-Tracker-Signature: v1=<HMAC-SHA256 hexadecimal>
```

La cadena firmada es `v1\nTIMESTAMP\nNONCE\nBODY_HASH`. Render acepta como máximo ±300 segundos, compara MACs con `timingSafeEqual` y rechaza el mismo timestamp+nonce. La cache incluida es local al proceso; si Render escala horizontalmente debe moverse a Redis o base de datos. La protección duradera contra duplicados sigue siendo el índice UNIQUE de `eventId`.

## Integración exacta en Budisa/Render

El código real de Budisa no estaba en este workspace, así que no se ha modificado a ciegas su ORM. [`render-integration/tracker-handler.js`](render-integration/tracker-handler.js) contiene el handler portable, [`tracker-auth.js`](render-integration/tracker-auth.js) la verificación, y [`postgres-repository.js`](render-integration/postgres-repository.js) un adaptador funcional para `node-postgres`.

Los cambios que deben incorporarse al backend real son:

1. Añadir `TRACKER_SHARED_SECRET` (idéntico a Railway) y `TRACKER_KEY_ID=gateway-v1` a las variables privadas de Render.
2. Instalar el capturador raw antes de cualquier otro parser JSON: `app.use(express.json(rawJsonOptions))`.
3. Registrar `app.post('/tracker', createTrackerHandler(...))`.
4. Adaptar solo las consultas de `findTrackerByImei`, `transaction` y `upsertPosition` al ORM/nombres reales.
5. Crear o adaptar una entidad Tracker con IMEI UNIQUE, truckId, enabled e ICCID opcional. No dar de alta IMEIs desconocidos desde el endpoint.
6. Añadir `eventId` UNIQUE en posiciones y hacer el insert con upsert/`ON CONFLICT DO NOTHING` dentro de una transacción. Un duplicado cuenta como aceptado.
7. Confirmar solo después del commit con `{ "ok": true, "accepted": N }`.

[`reference-schema.sql`](render-integration/reference-schema.sql) es una referencia PostgreSQL y no debe ejecutarse sin adaptar nombres/FKs al esquema Budisa. [`example-express.js`](render-integration/example-express.js) muestra el orden correcto. Para ejecutar esa muestra separadamente, instale las dependencias de su carpeta y configure `DATABASE_URL`; normalmente estos paquetes ya pertenecerán al backend principal.

Respuestas previstas: 200 con accepted completo; 401 firma/replay/timestamp inválido; 403 tracker desconocido o ICCID discordante; 400 payload inválido; 500 fallo transaccional. El endpoint verifica schema/source, IMEI, conteo, eventIds únicos, timestamps y rangos GPS.

## Alta de un nuevo camión

1. Obtenga el IMEI del FTC887.
2. Registre el tracker en Budisa y asócielo al camión; añada ICCID si se controla.
3. Añada el IMEI a `ALLOWED_IMEIS` en Railway si usa allowlist y redespliegue.
4. Configure host y puerto públicos del TCP Proxy en el FTC887.
5. Compruebe `imei_accepted` y `avl_packet_parsed` en logs.
6. Compruebe la primera posición persistida y `teltonika_ack` positivo.

## Protocolo y tratamiento de datos

El handshake contiene longitud UInt16BE + IMEI ASCII; se responde un byte `01` o `00`. Después, cada frame usa preamble de 4 bytes, longitud UInt32BE, data field y CRC de 4 bytes. El ACK AVL es un UInt32BE con el número confirmado.

Codec 8E interpreta timestamp UInt64, prioridad, GPS firmado para hemisferios sur/oeste y grupos IO N1/N2/N4/N8/NX con IDs y contadores de 2 bytes. Los UInt64 no seguros se serializan como decimal y los NX conservan hexadecimal; ICCID ASCII también se normaliza. Coordenadas sin fix permanecen en el batch con `gps.valid=false`, y registros históricos nunca se descartan por antigüedad.

## Tests

`npm test` usa `node:test` y cubre IMEI completo/fragmentado/inválido/allowlist, CRC válido e inválido, todos los grupos Codec 8E, coordenadas y timestamp, framing completo/byte a byte/2/10 trozos/dos frames juntos, HMAC válido/manipulado/expirado/replay, respuesta Render, ACK positivo/cero e idempotencia.

## Troubleshooting

- **No llega conexión:** compruebe cobertura/SIM, host sin esquema URL, puerto público (no 5000 salvo que Railway lo haya asignado así) y TCP Proxy al interno 5000.
- **IMEI rechazado:** revise que sea numérico de 14–17 dígitos y coincida exactamente con `ALLOWED_IMEIS`.
- **CRC inválido:** confirme Codec 8 Extended y que no haya un proxy HTTP entre dispositivo y gateway.
- **Codec incorrecto:** seleccione `Codec 8 Extended`; Codec 8 también está soportado, otros no.
- **Render 401:** secret/key ID distintos, raw body perdido por otro parser, reloj con más de cinco minutos de desfase o nonce repetido.
- **Render 403:** el IMEI no está registrado/habilitado en Budisa o el ICCID esperado no coincide.
- **Render 500:** revise la transacción, constraint, conexión a BD y logs del backend; el tracker recibirá ACK cero.
- **Reenvío continuo:** Render debe responder 2xx, JSON válido y accepted exactamente igual al batch. Compruebe también la restricción UNIQUE de eventId.
- **GPS 0/no fix:** el registro se conserva con `gps.valid=false`; espere fix GNSS y revise instalación/antena.
- **Sensor EYE no visible:** el gateway no inventa ni descarta IO desconocidos: todos los IDs recibidos se conservan en `records[].io.raw`. En un FMC880, un EYE Sensor configurado por nombre puede aparecer como el IO variable `11317`; si se configura por MAC, sus valores aparecen como IO del registro normal. El evento Railway `avl_packet_parsed` incluye ahora `ioIds`; si no aparece `11317` ni ningún ID del sensor en `ioIds`/`io.raw`, revise el emparejamiento Bluetooth, el filtro del sensor y que los IO correspondientes estén habilitados en la configuración de envío del FMC880. Cambiar `TRACKER_MODEL` solo corrige la etiqueta `device.model`; no activa el sensor.
- **Pitch/roll EYE:** los IDs fijos de pitch/roll y los parámetros 11/12 de AVL 11317 se normalizan en `io.known` como grados con signo, con campos `Raw` y `Valid`; el valor hexadecimal original permanece intacto en `io.raw`. Los valores fuera de −90…90° (pitch) o −180…180° (roll) quedan como `null` en el campo normalizado y no deben interpretarse como estado de la carga.
- **TCP Proxy incorrecto:** Railway debe apuntar al puerto interno `5000`; Teltonika usa el host/puerto público entregado.

## Estructura

```text
src/tcp/              servidor, contexto de socket y framing
src/teltonika/        IMEI, CRC, Codec 8E/8 y AVL IDs
src/forwarding/       payload, idempotencia, firma y cliente Render
src/health/           endpoint de salud
render-integration/   handler autenticado y adaptadores para Budisa
scripts/              simulador FTC887 y mock Render
test/                 pruebas unitarias y TCP de integración
```
