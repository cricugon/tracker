# Implementar gateway Teltonika FTC887 → Railway TCP → API Render

Quiero que implementes un proyecto completo, funcional y preparado para producción que actúe como gateway entre trackers GPS **Teltonika FTC887** y mi backend Node.js existente.

No quiero únicamente ejemplos o pseudocódigo: crea/modifica los archivos necesarios, implementa el código, tests, configuración, documentación y comprueba que todo funciona localmente.

## 1. Arquitectura objetivo

La arquitectura será:

```text
Teltonika FTC887
      |
      | TCP
      | Teltonika Codec 8 Extended
      v
Gateway Node.js
desplegado en Railway
      |
      | HTTPS POST
      | HMAC-SHA256
      v
https://budisa.onrender.com/tracker
      |
      v
Backend actual Node.js
      |
      v
Base de datos
```

El gateway de Railway NO tendrá base de datos.

Su única responsabilidad será:

1. aceptar conexiones TCP de trackers Teltonika FTC887;
2. identificar cada tracker mediante su IMEI;
3. recibir paquetes AVL;
4. validar correctamente los paquetes;
5. decodificar Codec 8 Extended;
6. convertir los registros a JSON;
7. mandarlos por HTTPS a:

```text
https://budisa.onrender.com/tracker
```

8. esperar a que Render confirme que los datos se han guardado/aceptado;
9. únicamente entonces responder al FTC887 con el ACK correspondiente.

Esto es importante para no perder posiciones.

---

# 2. Tecnología

Usar:

- Node.js 20 o superior.
- JavaScript moderno.
- Preferentemente módulos pequeños y separados.
- APIs nativas de Node siempre que sea razonable:
  - `net`
  - `http`
  - `crypto`
  - `fetch`
  - `Buffer`
- Evitar dependencias innecesarias.
- No usar una librería Teltonika abandonada o poco fiable como pieza central.
- Implementar nuestro propio parser de Codec 8 Extended siguiendo la especificación oficial Teltonika.
- Tests con `node:test` si es suficiente.

El proyecto debe poder arrancarse con:

```bash
npm install
npm start
```

y ejecutar tests con:

```bash
npm test
```

---

# 3. Estructura propuesta

Crea una estructura limpia parecida a:

```text
src/
  index.js
  config.js

  tcp/
    server.js
    connection.js
    frameBuffer.js

  teltonika/
    imei.js
    codec8e.js
    codec8.js
    crc16.js
    avlIds.js

  forwarding/
    renderClient.js
    signature.js

  utils/
    logger.js
    values.js

  health/
    server.js

test/
  imei.test.js
  codec8e.test.js
  crc16.test.js
  tcp-fragmentation.test.js
  signature.test.js
  render-client.test.js

.env.example
.gitignore
package.json
README.md
```

Puedes mejorar esta estructura si encuentras una organización más apropiada.

---

# 4. TCP Server

Crear un servidor TCP con Node usando:

```js
net.createServer()
```

Debe escuchar en:

```text
0.0.0.0
```

y puerto:

```text
TCP_PORT
```

con valor por defecto:

```text
5000
```

Railway expondrá ese puerto mediante TCP Proxy.

IMPORTANTE:

TCP es un stream.

NO asumir que cada evento:

```js
socket.on("data")
```

contiene exactamente un paquete.

Un paquete puede:

- llegar dividido en varios chunks;
- llegar junto con otro paquete;
- llegar byte a byte;
- contener varios registros AVL.

Implementar un buffer/acumulador por conexión y una máquina de estados.

Cada socket debe mantener como mínimo:

```js
{
  state,
  imei,
  buffer,
  connectedAt,
  lastActivityAt
}
```

Estados conceptuales:

```text
WAITING_IMEI
READY_FOR_AVL
```

Debe soportar correctamente:

```text
chunk 1 = mitad IMEI
chunk 2 = resto IMEI + mitad AVL
chunk 3 = resto AVL + otro AVL completo
```

sin perder ni duplicar datos.

---

# 5. Handshake IMEI Teltonika

Cuando se conecta el FTC887 inicialmente envía:

```text
2 bytes longitud IMEI
+
IMEI ASCII
```

Por ejemplo un IMEI de 15 caracteres.

Leer los primeros dos bytes como `UInt16BE`.

Validar:

- longitud razonable;
- caracteres numéricos;
- normalmente IMEI de 15 dígitos.

Guardar el IMEI en el contexto del socket.

Nunca tomar el IMEI de parámetros HTTP ni de datos externos posteriores.

El IMEI queda asociado al socket actual.

Si se acepta:

```text
server -> tracker
01
```

un único byte:

```js
Buffer.from([0x01])
```

Si se rechaza:

```text
00
```

y cerrar la conexión.

---

# 6. Control de trackers autorizados

Implementar variable:

```text
ALLOWED_IMEIS
```

Ejemplo:

```env
ALLOWED_IMEIS=356000000000001,356000000000002
```

Comportamiento:

### Si ALLOWED_IMEIS tiene contenido

Solo aceptar esos IMEIs.

Un IMEI no autorizado:

- responder `0x00`;
- registrar evento `imei_rejected`;
- cerrar socket.

### Si ALLOWED_IMEIS está vacío

Aceptar cualquier IMEI sintácticamente válido para facilitar desarrollo.

Mostrar un warning al arrancar:

```text
WARNING: ALLOWED_IMEIS is empty
```

En producción recomendar que esté configurado.

IMPORTANTE:

El IMEI identifica el dispositivo pero NO debe considerarse un secreto criptográfico.

La aplicación de Render también tiene que comprobar que ese IMEI corresponde a un tracker registrado.

---

# 7. Conexiones duplicadas

Mantener un Map:

```js
activeDevices: Map<imei, socket>
```

Si aparece otra conexión con el mismo IMEI mientras existe otra:

- registrar claramente `duplicate_imei_connection`;
- cerrar de forma limpia la conexión anterior;
- aceptar la conexión nueva.

Esto permite recuperarse de conexiones móviles TCP que hayan quedado zombie.

Eliminar correctamente el IMEI del Map al cerrar un socket, comprobando que ese socket siga siendo el actualmente registrado.

---

# 8. Formato AVL TCP

Después del IMEI, el FTC887 manda paquetes AVL.

Implementar framing correcto:

```text
4 bytes  Preamble
4 bytes  Data Field Length
N bytes  Data Field
4 bytes  CRC
```

Preamble esperado:

```text
00 00 00 00
```

`Data Field Length` es UInt32BE.

Aplicar límites de seguridad.

Por ejemplo:

```text
MAX_AVL_DATA_LENGTH=4096
```

aunque normalmente los paquetes sean mucho menores.

Si una longitud recibida es absurda:

- registrar error;
- cerrar conexión;
- nunca reservar buffers enormes según información enviada por el cliente.

---

# 9. CRC

Implementar validación CRC según protocolo Teltonika:

```text
CRC-16/IBM
```

sobre el Data Field, desde Codec ID hasta Number of Data 2.

El paquete contiene un campo CRC de 4 bytes; interpretar correctamente el CRC Teltonika y compararlo con el CRC calculado.

No procesar ni reenviar un paquete con CRC incorrecto.

Registrar:

```text
invalid_crc
```

y responder como paquete no aceptado o cerrar la conexión de forma segura.

Crear tests del CRC usando ejemplos oficiales Teltonika.

---

# 10. Codec

La configuración objetivo del FTC887 será:

```text
Protocol: TCP
Data Protocol: Codec 8 Extended
```

Implementar obligatoriamente:

```text
Codec ID 0x8E
```

También sería conveniente soportar:

```text
Codec 8 -> 0x08
```

si puede hacerse limpiamente sin complicar demasiado la arquitectura.

Si llega un Codec desconocido:

- no interpretar el paquete;
- no marcarlo como aceptado;
- registrar `unsupported_codec`;
- cerrar o rechazar limpiamente.

---

# 11. Parsing Codec 8 Extended

Codec 8 Extended contiene:

```text
Codec ID
Number of Data 1
AVL record 1
AVL record 2
...
Number of Data 2
```

Validar siempre:

```text
Number of Data 1 === Number of Data 2
```

Cada AVL Record contiene:

```text
Timestamp      8 bytes
Priority       1 byte
GPS Element   15 bytes
IO Element     variable
```

## GPS Element

Decodificar correctamente:

```text
Longitude     4 bytes signed
Latitude      4 bytes signed
Altitude      2 bytes
Angle         2 bytes
Satellites    1 byte
Speed         2 bytes
```

Longitude y latitude tienen precisión Teltonika de:

```text
valor / 10_000_000
```

Usar enteros signed donde corresponda para soportar:

- oeste;
- sur.

Resultado:

```js
gps: {
  latitude,
  longitude,
  altitudeM,
  angleDeg,
  satellites,
  speedKph
}
```

Añadir:

```js
gps.valid
```

según que las coordenadas estén dentro de rangos válidos y haya información GNSS razonable.

No eliminar un registro únicamente porque su posición sea antigua.

Los trackers pueden almacenar registros sin cobertura y enviarlos posteriormente.

---

# 12. Timestamp

El timestamp AVL son milisegundos Unix UTC.

Entregar:

```js
timestampMs
```

y:

```js
timestamp
```

como ISO 8601.

Ejemplo:

```json
{
  "timestampMs": 1787658000000,
  "timestamp": "2026-08-25T10:20:00.000Z"
}
```

Usar BigInt internamente al leer UInt64 para evitar errores.

Antes de convertir a Number comprobar que sea seguro.

---

# 13. IO Elements de Codec 8 Extended

Implementar correctamente todos los grupos Codec 8E:

```text
Event IO ID
Total IO Count

N1
  AVL ID + 1-byte value

N2
  AVL ID + 2-byte value

N4
  AVL ID + 4-byte value

N8
  AVL ID + 8-byte value

NX
  AVL ID
  length
  variable bytes
```

En Codec 8 Extended:

- IDs son de 2 bytes;
- counts son de 2 bytes donde corresponde.

Conservar TODOS los valores aunque no conozcamos su significado.

Formato recomendado:

```js
io: {
  eventId: 239,

  raw: {
    "16": 123456,
    "21": 4,
    "239": 1,
    "240": 1
  },

  known: {
    ...
  }
}
```

Los valores de 8 bytes que excedan `Number.MAX_SAFE_INTEGER` deben convertirse a string decimal.

Los valores NX desconocidos pueden enviarse en hexadecimal.

Si son ASCII conocidos, por ejemplo ICCID, decodificarlos también.

---

# 14. AVL IDs importantes del FTC887

Crear un fichero central:

```text
src/teltonika/avlIds.js
```

con al menos estos IDs conocidos del FTC887:

```text
16    Total Odometer, metros
17    Axis X
18    Axis Y
19    Axis Z
21    GSM Signal
67    Battery Voltage, mV
68    Battery Current, mA
69    GNSS Status
70    PCB Temperature
113   Battery Level, %
181   GNSS PDOP
182   GNSS HDOP
199   Trip Odometer, metros
205   GSM Cell ID
206   GSM Area Code
237   Network Type
239   Ignition
240   Movement
241   GSM Operator Code
303   Instant Movement
386   Time From Last Fix, segundos
449   Ignition On Counter, segundos
641   ICCID
800   External Voltage, mV
1148  Connectivity Quality
1433  Dead Reckoning Status
1434  Turning Alignment
1435  Straight Alignment
```

El resultado normalizado debería incluir cuando existan:

```js
known: {
  totalOdometerM,
  tripOdometerM,

  ignition,
  movement,
  instantMovement,

  batteryVoltageMv,
  batteryCurrentMa,
  batteryLevelPct,
  externalVoltageMv,

  gsmSignal,
  networkType,
  gsmCellId,
  gsmAreaCode,

  gnssStatus,
  gnssPdop,
  gnssHdop,

  iccid,

  ignitionOnSeconds,
  timeFromLastFixSeconds,

  deadReckoningStatus
}
```

No inventar campos si el AVL ID no estaba presente.

Debe seguir existiendo además `io.raw`.

---

# 15. Identificación inequívoca del tracker

Cada petición enviada a Render tiene que incluir:

```json
{
  "device": {
    "manufacturer": "Teltonika",
    "model": "FTC887",
    "imei": "356..."
  }
}
```

Si el paquete contiene ICCID:

```json
{
  "device": {
    "manufacturer": "Teltonika",
    "model": "FTC887",
    "imei": "356...",
    "iccid": "..."
  }
}
```

IMPORTANTE:

El protocolo TCP realmente proporciona el IMEI.

El modelo `FTC887` se conoce porque este gateway está configurado para esa familia de dispositivos, no porque Teltonika lo envíe necesariamente en cada paquete.

Render debe utilizar el IMEI como clave para buscar:

```text
Tracker -> Truck
```

Nunca enviar `truckId` desde el gateway como dato autoritativo.

La asociación:

```text
IMEI -> camión
```

debe pertenecer a la base de datos de la aplicación principal.

---

# 16. Payload hacia Render

Enviar UN request por paquete AVL, no uno por cada posición individual.

Así reducimos overhead.

Ejemplo de payload:

```json
{
  "schemaVersion": 1,
  "source": "teltonika-gateway",

  "device": {
    "manufacturer": "Teltonika",
    "model": "FTC887",
    "imei": "356000000000001",
    "iccid": "894..."
  },

  "packet": {
    "packetId": "sha256...",
    "codec": "8E",
    "recordCount": 2,
    "receivedAt": "2026-08-25T10:20:30.000Z"
  },

  "records": [
    {
      "eventId": "sha256...",
      "index": 0,
      "timestampMs": 1787658000000,
      "timestamp": "2026-08-25T10:20:00.000Z",
      "priority": 0,

      "gps": {
        "latitude": 40.4168,
        "longitude": -3.7038,
        "altitudeM": 650,
        "angleDeg": 180,
        "satellites": 14,
        "speedKph": 82,
        "valid": true
      },

      "io": {
        "eventId": 239,
        "raw": {
          "16": 15342234,
          "21": 4,
          "239": 1,
          "240": 1,
          "800": 27800
        },
        "known": {
          "totalOdometerM": 15342234,
          "gsmSignal": 4,
          "ignition": true,
          "movement": true,
          "externalVoltageMv": 27800
        }
      }
    }
  ]
}
```

---

# 17. Idempotencia

Este punto es MUY importante.

Teltonika puede volver a mandar un paquete si no recibe ACK.

También puede ocurrir:

```text
Railway -> Render
```

Render guarda correctamente la posición pero la respuesta HTTP se pierde.

El gateway entonces no sabe que se guardó y Teltonika la volverá a enviar.

Por ello generar:

```text
packetId
```

como:

```text
SHA-256 del frame AVL original completo
```

y cada registro:

```text
eventId = SHA256(
  imei + ":" + packetId + ":" + recordIndex
)
```

Debe ser determinista.

Si el mismo paquete llega otra vez:

```text
eventId
```

debe ser exactamente el mismo.

El backend Render debe guardar `eventId` con índice UNIQUE o equivalente.

Si vuelve a llegar un `eventId` ya almacenado:

- NO crear posición duplicada;
- considerarlo igualmente aceptado;
- devolverlo dentro del número de registros aceptados.

---

# 18. Seguridad Railway -> Render

NO quiero simplemente:

```text
Authorization: Bearer contraseña
```

Implementar firma HMAC-SHA256.

Variables:

```env
TRACKER_SHARED_SECRET=
TRACKER_KEY_ID=gateway-v1
```

Generar el secret con al menos 32 bytes aleatorios.

Por ejemplo se podrá generar externamente con:

```bash
openssl rand -hex 32
```

El mismo secret estará:

- como variable privada en Railway;
- como variable privada en Render.

NUNCA:

- hardcodearlo;
- escribirlo en logs;
- subirlo a Git;
- devolverlo desde `/health`.

---

# 19. Firma HMAC

Para cada request:

Crear exactamente el JSON que será enviado:

```js
const rawBody = JSON.stringify(payload);
```

Generar:

```text
timestamp = Unix timestamp actual en segundos
nonce = UUID aleatorio
bodyHash = SHA256(rawBody) en hex
```

Canonical string:

```text
v1
TIMESTAMP
NONCE
BODY_HASH
```

Es decir:

```js
[
  "v1",
  timestamp,
  nonce,
  bodyHash
].join("\n")
```

Calcular:

```text
HMAC-SHA256(TRACKER_SHARED_SECRET, canonicalString)
```

en hexadecimal.

Enviar:

```text
Content-Type: application/json

X-Tracker-Key-Id: gateway-v1
X-Tracker-Timestamp: ...
X-Tracker-Nonce: ...
X-Tracker-Content-SHA256: ...
X-Tracker-Signature: v1=<hex>
```

La petición será exclusivamente:

```text
HTTPS
```

a:

```text
https://budisa.onrender.com/tracker
```

No permitir HTTP en producción.

---

# 20. Verificación HMAC en Render

Además del gateway, necesito que generes el código necesario para integrar `/tracker` en mi aplicación Node.js de Render.

Si este workspace contiene también el backend actual, intégralo directamente siguiendo su arquitectura existente.

Si no está disponible, crea:

```text
render-integration/
```

con un ejemplo completo y claramente portable.

La ruta debe verificar:

1. presencia de headers;
2. `X-Tracker-Key-Id`;
3. timestamp;
4. máximo 5 minutos de diferencia entre el timestamp firmado y el servidor;
5. SHA-256 del body recibido;
6. HMAC;
7. comparación usando:

```js
crypto.timingSafeEqual()
```

Nunca usar:

```js
expected === receivedSignature
```

para comparar MACs.

---

# 21. Raw body en Express

Como la firma depende de los bytes exactos enviados, conservar el body original.

Si el backend usa Express, hacer algo equivalente a:

```js
express.json({
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  }
})
```

Asegúrate de integrarlo correctamente con el middleware existente.

No ejecutar otro parser JSON antes que destruya la posibilidad de verificar los bytes originales.

Calcular:

```text
X-Tracker-Content-SHA256
```

contra:

```text
req.rawBody
```

---

# 22. Replay protection

Implementar:

```text
timestamp máximo +/- 300 segundos
```

y una cache temporal de:

```text
timestamp + nonce
```

para rechazar reutilización inmediata de la misma petición.

La protección principal de idempotencia debe seguir siendo `eventId` en base de datos.

Documentar que si la aplicación Render escala horizontalmente, la cache de nonces en memoria no es global y sería preferible almacenarla en:

- Redis;
- o base de datos.

No añadir Redis únicamente por esto al proyecto inicial.

---

# 23. Validación en Render

Después de autenticar la petición:

Validar:

```text
schemaVersion === 1
source === "teltonika-gateway"
device.imei válido
packet.recordCount === records.length
eventId presente en todos los registros
GPS dentro de rangos razonables
```

Buscar el tracker en nuestra base de datos mediante:

```text
device.imei
```

Si no existe:

```text
HTTP 403
```

con algo como:

```json
{
  "ok": false,
  "code": "UNKNOWN_DEVICE"
}
```

NO crear automáticamente un tracker desconocido.

La asociación correcta será conceptualmente:

```text
tracker.imei
   ->
tracker.truckId
   ->
camión
```

Si existe ICCID y en nuestra BD conocemos el ICCID esperado, compararlo.

Si no coincide:

- registrar alerta;
- rechazar el paquete o dejar configurable el comportamiento.

IMEI + ICCID supone una comprobación adicional, aunque NO debe describirse como autenticación criptográfica.

---

# 24. Persistencia en Render

La ruta:

```text
POST /tracker
```

debe insertar los registros en una transacción si la tecnología de base de datos actual lo permite.

Por cada registro:

```text
eventId UNIQUE
```

Si ya existe:

```text
duplicate = true
```

pero se considera aceptado.

El endpoint debe responder únicamente cuando los registros estén realmente persistidos o identificados como duplicados previamente persistidos.

Respuesta correcta:

```json
{
  "ok": true,
  "accepted": 2
}
```

`accepted` debe ser exactamente igual al número de registros recibidos.

---

# 25. ACK Teltonika

Esta es una regla obligatoria.

Para un paquete con:

```text
N registros
```

NO mandar el ACK Teltonika hasta recibir de Render:

```text
HTTP 2xx
```

y:

```json
{
  "ok": true,
  "accepted": N
}
```

Entonces responder al FTC887 usando UInt32BE:

```js
const ack = Buffer.alloc(4);
ack.writeUInt32BE(N);
socket.write(ack);
```

Ejemplo:

1 registro:

```text
00 00 00 01
```

2 registros:

```text
00 00 00 02
```

---

# 26. Fallo de Render

Si:

- timeout;
- DNS error;
- HTTP 4xx;
- HTTP 5xx;
- firma rechazada;
- respuesta JSON incorrecta;
- `accepted !== records.length`;

el paquete NO se considera procesado.

Responder:

```text
00 00 00 00
```

o aplicar el comportamiento Teltonika correcto equivalente para indicar cero registros aceptados.

Después cerrar la conexión si es la opción más segura para forzar un nuevo ciclo de envío.

NO devolver el número total de registros si Render no los ha confirmado.

Este requisito existe para evitar pérdida silenciosa de posiciones.

---

# 27. Retry HTTP

El gateway puede hacer unos pocos reintentos rápidos hacia Render antes de devolver fallo al tracker.

Configurable:

```env
RENDER_MAX_RETRIES=2
RENDER_TIMEOUT_MS=5000
```

Usar backoff corto.

No mantener reintentos durante minutos.

Teltonika ya tiene su propio mecanismo de almacenamiento/reenvío.

No queremos implementar una segunda cola persistente en Railway.

---

# 28. Timeout del socket

Configurar idle timeout razonable:

```env
TCP_IDLE_TIMEOUT_MS=120000
```

Al expirar:

- log;
- destruir socket;
- limpiar `activeDevices`.

Activar también:

```js
socket.setKeepAlive(true)
```

cuando sea apropiado.

---

# 29. Límites de seguridad

Implementar defensas contra conexiones TCP maliciosas:

- límite de longitud IMEI;
- límite de frame;
- validar preamble;
- validar CRC;
- validar codec;
- validar counts;
- comprobar que nunca se lea fuera del Buffer;
- cerrar conexiones que envíen datos malformados;
- socket idle timeout;
- no aceptar buffers ilimitados;
- no lanzar el proceso completo por un paquete corrupto.

Un error en un tracker debe afectar únicamente a su socket.

---

# 30. Logging

Usar logs estructurados.

Eventos útiles:

```text
server_started
device_connected
imei_received
imei_accepted
imei_rejected
duplicate_imei_connection
avl_packet_received
avl_packet_parsed
invalid_crc
invalid_packet
render_forward_started
render_forward_success
render_forward_failed
teltonika_ack
socket_timeout
device_disconnected
```

Cada evento relacionado con dispositivo debe poder incluir:

```text
imei
```

pero crear una opción:

```env
LOG_FULL_IMEI=false
```

Por defecto, en logs generales, enmascarar parcialmente el IMEI.

Nunca loguear:

- TRACKER_SHARED_SECRET;
- HMAC completo si no es necesario;
- variables de entorno;
- body completo por defecto.

Añadir:

```env
LOG_RAW_PACKETS=false
```

Solo si se activa expresamente se podrán mostrar paquetes hex durante debugging.

---

# 31. Health server

Además del servidor TCP, crear un pequeño servidor HTTP para observabilidad.

Puerto:

```text
PORT
```

o:

```text
HEALTH_PORT
```

Endpoint:

```text
GET /health
```

Respuesta:

```json
{
  "ok": true,
  "service": "teltonika-ftc887-gateway",
  "uptimeSeconds": 1234,
  "activeConnections": 3,
  "lastRenderSuccessAt": "...",
  "stats": {
    "packetsReceived": 100,
    "packetsForwarded": 99,
    "packetsRejected": 1
  }
}
```

No devolver IMEIs ni secrets.

Esto permitirá comprobar Railway fácilmente.

---

# 32. Variables de entorno

Crear `.env.example`:

```env
NODE_ENV=development

TCP_PORT=5000
HEALTH_PORT=3000

RENDER_TRACKER_URL=https://budisa.onrender.com/tracker

TRACKER_KEY_ID=gateway-v1
TRACKER_SHARED_SECRET=CHANGE_ME

ALLOWED_IMEIS=

RENDER_TIMEOUT_MS=5000
RENDER_MAX_RETRIES=2

TCP_IDLE_TIMEOUT_MS=120000
MAX_AVL_DATA_LENGTH=4096

LOG_LEVEL=info
LOG_FULL_IMEI=false
LOG_RAW_PACKETS=false
```

En producción exigir:

```text
TRACKER_SHARED_SECRET
```

y fallar durante el arranque si no está configurado.

---

# 33. Graceful shutdown

Implementar correctamente:

```text
SIGTERM
SIGINT
```

Al recibirlos:

- dejar de aceptar conexiones nuevas;
- cerrar health server;
- cerrar sockets cuando sea posible;
- terminar de forma limpia.

Esto es importante en despliegues Railway.

---

# 34. Railway

El README debe explicar paso a paso cómo desplegar.

Configuración esperada:

```text
TCP_PORT=5000
```

Crear en Railway:

```text
Settings
-> Networking
-> TCP Proxy
-> internal port 5000
```

Railway devolverá algo parecido a:

```text
xxxx.proxy.rlwy.net:12345
```

Explicar que esos DOS valores son los que se configuran en el Teltonika:

```text
Domain:
xxxx.proxy.rlwy.net

Port:
12345

Protocol:
TCP

Data Protocol:
Codec 8 Extended
```

NO configurar:

```text
https://...
```

en el FTC887.

El dispositivo se conecta directamente mediante TCP.

---

# 35. Configuración inicial FTC887

Documentar en README una sección específica:

```text
FTC887 configuration
```

con:

```text
Domain: hostname TCP Proxy Railway
Port: puerto TCP Proxy Railway
Protocol: TCP
Data Protocol: Codec 8 Extended
```

Para la primera prueba podemos utilizar:

```text
TLS Encryption: None
```

para aislar problemas de protocolo.

Una vez comprobado:

```text
IMEI
Codec
GPS
ACK
Render forwarding
```

documentar como mejora posterior activar TLS entre FTC887 y gateway.

No confundir:

```text
TCP Teltonika
```

con:

```text
HTTPS Render
```

Son conexiones distintas.

---

# 36. TLS dispositivo -> Railway como fase posterior

Diseñar el código para que en el futuro sea posible reemplazar:

```js
net.createServer()
```

por:

```js
tls.createServer()
```

sin reescribir el parser Teltonika.

No hace falta bloquear la primera versión por los certificados Teltonika.

La seguridad obligatoria en esta entrega es:

```text
Railway -> Render:
HTTPS + HMAC
```

Añadir una sección al README explicando que IMEI no es autenticación criptográfica del dispositivo.

Para mayor seguridad de:

```text
FTC887 -> Railway
```

pueden considerarse posteriormente:

- TLS soportado por Teltonika;
- APN privado;
- red móvil privada;
- controles adicionales de SIM/provisioning.

---

# 37. Tests obligatorios

Crear tests automáticos para:

### IMEI

- paquete completo;
- IMEI fragmentado;
- IMEI inválido;
- IMEI no autorizado.

### TCP fragmentation

Simular que un frame llega:

- de una vez;
- byte por byte;
- partido en 2;
- partido en 10;
- dos paquetes juntos.

El resultado debe ser idéntico.

### CRC

- CRC correcto;
- CRC incorrecto.

### Codec 8E

Verificar:

- timestamp;
- latitude;
- longitude;
- altitude;
- angle;
- satellites;
- speed;
- IO N1;
- IO N2;
- IO N4;
- IO N8;
- IO NX.

Utilizar siempre que sea posible paquetes de ejemplo de la documentación oficial Teltonika.

### HMAC

- firma válida;
- secret incorrecto;
- body manipulado;
- timestamp expirado;
- nonce repetido.

### ACK

Render acepta N:

```text
ACK = N
```

Render falla:

```text
ACK != N
```

y jamás se confirma como aceptado.

### Idempotencia

El mismo paquete dos veces debe producir exactamente los mismos:

```text
packetId
eventId
```

---

# 38. Fixture de simulación

Crear además una herramienta:

```text
scripts/simulate-device.js
```

que permita simular localmente un Teltonika básico.

Debe poder:

1. abrir TCP hacia localhost;
2. mandar IMEI;
3. comprobar `0x01`;
4. mandar un frame Codec 8E de prueba;
5. mostrar el ACK recibido.

Uso:

```bash
node scripts/simulate-device.js
```

Esto debe permitir probar el gateway antes de conectar el FTC887 físico.

---

# 39. Modo mock Render

Para tests/desarrollo, crear un pequeño mock opcional:

```text
scripts/mock-render.js
```

que implemente:

```text
POST /tracker
```

verifique la firma HMAC y responda:

```json
{
  "ok": true,
  "accepted": N
}
```

Así se puede probar toda la cadena local:

```text
simulated Teltonika
      ->
TCP gateway
      ->
mock Render HTTPS/HTTP local
```

Para desarrollo local puede usarse HTTP explícitamente si:

```env
ALLOW_INSECURE_RENDER_URL=true
```

pero en producción debe rechazarse cualquier `RENDER_TRACKER_URL` que no empiece por:

```text
https://
```

---

# 40. Integración con mi backend Budisa

Mi aplicación principal está desplegada en:

```text
https://budisa.onrender.com
```

El endpoint será:

```text
POST /tracker
```

Por tanto:

```env
RENDER_TRACKER_URL=https://budisa.onrender.com/tracker
```

Si tienes acceso al código existente de Budisa en este workspace:

1. inspecciona primero la arquitectura;
2. identifica Express/Fastify/etc.;
3. identifica ORM/base de datos;
4. identifica modelos de camión/tracker;
5. integra `/tracker` respetando la arquitectura existente;
6. no crees una segunda arquitectura paralela.

Si el backend no está disponible:

genera una implementación de referencia suficientemente completa dentro de:

```text
render-integration/
```

y documenta qué partes deben conectarse a nuestra capa real de base de datos.

---

# 41. Modelo de datos sugerido en Budisa

Si todavía no existe una entidad Tracker, proponer conceptualmente:

```text
Tracker
-------
id
imei UNIQUE
iccid nullable
model
truckId
enabled
createdAt
updatedAt
```

Y posiciones:

```text
TrackerPosition
---------------
id
eventId UNIQUE
trackerId
timestamp
latitude
longitude
altitude
angle
satellites
speed
priority
ignition
movement
odometer
rawIo JSON/JSONB
createdAt
```

Pero:

NO modifiques ciegamente el esquema.

Primero inspecciona la base de datos/ORM actual y adapta esto al diseño existente.

---

# 42. Respuesta de `/tracker`

Contrato esperado:

Éxito:

```http
HTTP 200
```

```json
{
  "ok": true,
  "accepted": 2
}
```

IMEI desconocido:

```http
HTTP 403
```

```json
{
  "ok": false,
  "code": "UNKNOWN_DEVICE"
}
```

Firma inválida:

```http
HTTP 401
```

```json
{
  "ok": false,
  "code": "INVALID_SIGNATURE"
}
```

Payload inválido:

```http
HTTP 400
```

```json
{
  "ok": false,
  "code": "INVALID_PAYLOAD"
}
```

Error interno:

```http
HTTP 500
```

El gateway solo hace ACK positivo cuando:

```text
2xx
AND
body.ok === true
AND
body.accepted === records.length
```

---

# 43. Consideraciones de flota

El gateway debe estar preparado desde el principio para muchos camiones.

Por ejemplo:

```text
FTC887 camion 1 ----\
FTC887 camion 2 -----\
FTC887 camion 3 ------> mismo TCP server Railway
FTC887 camion 4 -----/
...
```

No crear:

```text
un proceso por camión
```

Todos usan el mismo servidor.

Cada conexión tiene su propio:

```text
socket
imei
buffer
estado
```

No debe haber estado AVL compartido entre conexiones.

---

# 44. Importante: batches Teltonika

No asumir que:

```text
1 envío TCP = 1 posición
```

Un FTC887 puede acumular registros sin cobertura y posteriormente mandar:

```text
10
20
50
...
```

registros en un único AVL packet.

El parser debe soportarlo.

Enviar todo ese paquete como un batch a Render.

Render debe guardarlo transaccionalmente/idempotentemente.

Solo después enviar:

```text
ACK = número total de registros
```

---

# 45. No perder información

Además de los campos normalizados, conservar:

```text
io.raw
```

para que en el futuro podamos utilizar nuevos AVL IDs sin tener que modificar datos históricos.

No guardar el frame binario completo en la base de datos por defecto.

El gateway puede calcular su SHA-256 para `packetId` y descartarlo tras procesarlo.

---

# 46. Seguridad de secretos

Crear `.gitignore` con:

```text
.env
.env.*
!.env.example
```

No imprimir secrets.

El README debe explicar cómo generar:

```text
TRACKER_SHARED_SECRET
```

y configurarlo manualmente tanto en:

```text
Railway
```

como en:

```text
Render
```

---

# 47. Calidad del código

Quiero código preparado para mantener durante años.

Requisitos:

- funciones pequeñas;
- nombres claros;
- evitar callbacks anidados;
- manejo explícito de errores;
- comments únicamente donde aporten contexto;
- nada de `console.log()` aleatorio;
- evitar `any` conceptualmente;
- no tragarse excepciones;
- no confiar en input TCP;
- no hacer conversiones Buffer inseguras;
- tests deterministas.

---

# 48. README

Crear un README muy completo con:

1. qué hace el proyecto;
2. arquitectura;
3. protocolo Teltonika;
4. variables de entorno;
5. instalación local;
6. tests;
7. simulador;
8. despliegue Railway;
9. creación de TCP Proxy;
10. configuración FTC887;
11. configuración de `/tracker` en Render;
12. HMAC;
13. alta de un nuevo IMEI;
14. troubleshooting.

Añadir sección:

```text
Cómo añadir un nuevo camión
```

Flujo:

```text
1. obtener IMEI FTC887
2. registrar IMEI en Budisa asociado al camión
3. añadir IMEI a ALLOWED_IMEIS si usamos allowlist Railway
4. configurar en FTC887 host/port Railway
5. comprobar conexión
6. comprobar primera posición
```

---

# 49. Troubleshooting

Documentar mensajes útiles para:

```text
No llega ninguna conexión
IMEI rechazado
CRC inválido
Codec incorrecto
Render devuelve 401
Render devuelve 403
Render devuelve 500
Tracker reenvía continuamente
GPS 0/no fix
TCP proxy Railway mal configurado
```

---

# 50. Métricas mínimas

Mantener contadores en memoria:

```js
connectionsTotal
activeConnections
imeiRejected
packetsReceived
recordsReceived
packetsForwarded
recordsForwarded
packetsRejected
renderErrors
crcErrors
```

Exponerlos en `/health` o `/metrics` simple.

No necesitamos Prometheus todavía.

---

# 51. Comportamiento ante Render caído

Quiero preservar los datos antes que aparentar disponibilidad.

Si Render está caído:

```text
FTC887
 -> Railway
 -> Render FAIL
```

NO hacer:

```text
ACK positivo al FTC887
```

La prioridad es que Teltonika mantenga/reenvíe esos registros.

La idempotencia de `eventId` protegerá de duplicados.

---

# 52. Criterios de aceptación

No des el trabajo por terminado hasta poder demostrar:

### Caso 1

Tracker conecta.

```text
IMEI -> accepted
```

### Caso 2

Tracker envía AVL Codec 8E.

Se obtiene:

```text
imei
timestamp
latitude
longitude
speed
satellites
io
```

### Caso 3

Gateway envía a:

```text
POST https://budisa.onrender.com/tracker
```

con HMAC.

### Caso 4

Render devuelve:

```json
{
  "ok": true,
  "accepted": 1
}
```

Gateway responde:

```text
00 00 00 01
```

al FTC887.

### Caso 5

Render falla.

Gateway NO devuelve ACK positivo.

### Caso 6

Mismo paquete llega otra vez.

`eventId` no cambia.

### Caso 7

IMEI desconocido.

Puede ser rechazado por allowlist y obligatoriamente debe ser rechazado por Budisa si no corresponde a un tracker registrado.

### Caso 8

Un paquete TCP llega fragmentado byte a byte.

Se procesa correctamente.

---

# 53. Al terminar

Ejecuta:

```bash
npm test
```

y corrige todos los errores.

Arranca el servicio local.

Prueba:

```text
simulador -> gateway -> mock Render
```

y verifica el ACK.

Después dame un resumen final indicando:

```text
- archivos creados
- arquitectura final
- tests ejecutados
- variables Railway necesarias
- variables Render necesarias
- puerto que debo poner en TCP Proxy
- exactamente qué debo configurar en Teltonika Configurator
- cambios exactos necesarios en Budisa
- cualquier paso manual que yo todavía tenga que hacer
```

No me pidas confirmación para decisiones menores.

Haz una implementación funcional completa y utiliza criterios seguros por defecto.