/* eslint-disable camelcase */

exports.shorthands = undefined;

/**
 * Adds optional contact-info fields to `contacts` and timestamps to
 * `call_notes` so notes can be listed chronologically in the contact sidebar.
 *
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns(
    'contacts',
    {
      email: { type: 'text' },
      alternate_number: { type: 'text' },
      organization: { type: 'text' },
      address: { type: 'text' },
    },
    { ifNotExists: true }
  );

  pgm.addColumns(
    'call_notes',
    {
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('NOW()'),
      },
      updated_at: { type: 'timestamptz' },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('call_notes', 'created_at', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('call_notes', 'created_at', { ifExists: true });
  pgm.dropColumns('call_notes', ['created_at', 'updated_at'], {
    ifExists: true,
  });
  pgm.dropColumns(
    'contacts',
    ['email', 'alternate_number', 'organization', 'address'],
    { ifExists: true }
  );
};
