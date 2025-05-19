exports.up = (pgm) => {
  pgm.createTable('api_proxy_calls', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: { type: 'uuid', references: 'users(id)' },
    url: { type: 'varchar', notNull: true },
    credits_spent: { type: 'integer', notNull: true },
    created_at: {
      type: 'integer',
      notNull: true,
      default: pgm.func('EXTRACT(epoch FROM CURRENT_TIMESTAMP)::integer'),
    },
  });
  pgm.createIndex('api_proxy_calls', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('api_proxy_calls');
};
