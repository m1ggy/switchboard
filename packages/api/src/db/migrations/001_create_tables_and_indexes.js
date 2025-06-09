/* eslint-disable camelcase */

exports.shorthands = undefined;

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createType('message_statuses', ['sent', 'draft']);
  pgm.createType('message_direction', ['inbound', 'outbound']);
  pgm.createType('notification_types', ['user', 'global', 'system']);

  pgm.createTable('companies', {
    id: 'uuid PRIMARY KEY',
    name: { type: 'varchar', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createTable('users', {
    id: 'uuid PRIMARY KEY',
    user_id: { type: 'text', notNull: true },
    added_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    is_active: { type: 'bool', notNull: true, default: true },
  });

  pgm.createTable('user_companies', {
    id: 'uuid PRIMARY KEY',
    user_id: { type: 'text', notNull: true },
    company_id: { type: 'uuid', notNull: true },
  });

  pgm.createIndex('user_companies', 'user_id');

  pgm.createTable('numbers', {
    id: 'uuid PRIMARY KEY',
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)' },
    number: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
    label: { type: 'text' },
  });

  pgm.createIndex('numbers', 'company_id');
  pgm.createIndex('numbers', 'created_at');

  pgm.createTable('contacts', {
    id: 'uuid PRIMARY KEY',
    number: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz' },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)' },
    label: { type: 'text', notNull: true },
  });

  pgm.createIndex('contacts', 'company_id');
  pgm.createIndex('contacts', 'created_at');
  pgm.createIndex('contacts', 'number');

  pgm.createTable('inboxes', {
    id: 'uuid PRIMARY KEY',
    number_id: { type: 'uuid', notNull: true, references: 'numbers(id)' },
    contact_id: { type: 'uuid', notNull: true, references: 'contacts(id)' },
    last_message_id: { type: 'uuid' },
    last_call_id: { type: 'uuid' },
    last_viewed_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('inboxes', 'unique_number_contact', {
    unique: ['number_id', 'contact_id'],
  });

  pgm.createIndex('inboxes', 'number_id');
  pgm.createIndex('inboxes', 'contact_id');

  pgm.createTable('messages', {
    id: 'uuid PRIMARY KEY',
    number_id: { type: 'uuid', notNull: true, references: 'numbers(id)' },
    message: { type: 'text' },
    created_at: { type: 'timestamptz' },
    contact_id: { type: 'uuid', notNull: true, references: 'contacts(id)' },
    inbox_id: { type: 'uuid', notNull: true, references: 'inboxes(id)' },
    meta: { type: 'json' },
    status: { type: 'message_statuses' },
    direction: { type: 'message_direction', notNull: true },
  });

  pgm.createIndex('messages', 'number_id');
  pgm.createIndex('messages', 'contact_id');
  pgm.createIndex('messages', 'inbox_id');
  pgm.createIndex('messages', 'created_at');
  pgm.createIndex('messages', 'status');
  pgm.createIndex('messages', 'direction');

  pgm.createTable('calls', {
    id: 'uuid PRIMARY KEY',
    number_id: { type: 'uuid', notNull: true, references: 'numbers(id)' },
    contact_id: { type: 'uuid', notNull: true, references: 'contacts(id)' },
    initiated_at: { type: 'timestamptz' },
    duration: { type: 'integer' },
    meta: { type: 'json' },
    from: { type: 'string', notNull: true },
    to: { type: 'string', notNull: true },
  });

  pgm.createIndex('calls', 'number_id');
  pgm.createIndex('calls', 'contact_id');
  pgm.createIndex('calls', 'initiated_at');

  pgm.createTable('notifications', {
    id: 'uuid PRIMARY KEY',
    message: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('current_timestamp') },
    meta: { type: 'jsonb', default: pgm.func(`'{}'::jsonb`) },
    viewed: { type: 'boolean', default: false },
    user_id: { type: 'text', default: null },
    viewed_at: { type: 'timestamptz', default: null },
    type: { type: 'notification_types', default: 'user' },
    company_id: { type: 'uuid', default: null },
  });

  pgm.createIndex('notifications', 'user_id');
  pgm.createIndex('notifications', 'viewed');
  pgm.createIndex('notifications', 'type');

  pgm.createTable('bot_subscribers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: { type: 'text', notNull: true, unique: true },
    conversation_reference: { type: 'jsonb', notNull: true },
    name: { type: 'text' },
    team_id: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('bot_subscribers', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('calls');
  pgm.dropTable('messages');
  pgm.dropTable('inboxes');
  pgm.dropTable('contacts');
  pgm.dropTable('numbers');
  pgm.dropTable('companies');
  pgm.dropTable('users_companies');
  pgm.dropTable('notifications');
  pgm.dropTable('users');
  pgm.dropType('message_direction');
  pgm.dropType('message_statuses');
  pgm.dropType('notification_types');
  pgm.dropTable('bot_subscribers');
};
