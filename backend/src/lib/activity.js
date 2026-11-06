export function createLogger(db) {
  return async function log(req, action, { entity = null, entityId = null, detail = null, userId } = {}) {
    const uid = userId !== undefined ? userId : req.user?.id ?? null;
    const d = detail === null || typeof detail === 'string' ? detail : JSON.stringify(detail);
    await db.run(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
      [uid, action, entity, entityId, d, req.ip ?? null]
    );
  };
}
