// Portable node-postgres adapter. Rename tables/columns to match Budisa instead
// of applying the reference schema blindly.
export function createPostgresRepository(pool) {
  return {
    async findTrackerByImei(imei) {
      const result = await pool.query(
        'SELECT id, imei, iccid, truck_id AS "truckId", enabled FROM trackers WHERE imei = $1',
        [imei],
      );
      return result.rows[0] || null;
    },

    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async upsertPosition({ tracker, record, packet }, client) {
      const known = record.io?.known || {};
      await client.query(`
        INSERT INTO tracker_positions (
          event_id, tracker_id, packet_id, recorded_at, latitude, longitude,
          altitude, angle, satellites, speed, priority, ignition, movement,
          odometer_m, raw_io
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (event_id) DO NOTHING
      `, [
        record.eventId, tracker.id, packet.packetId, new Date(record.timestampMs),
        record.gps.latitude, record.gps.longitude, record.gps.altitudeM,
        record.gps.angleDeg, record.gps.satellites, record.gps.speedKph,
        record.priority, known.ignition ?? null, known.movement ?? null,
        known.totalOdometerM ?? null, record.io?.raw || {},
      ]);
    },
  };
}

