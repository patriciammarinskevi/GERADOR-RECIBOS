/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
// dentro do arquivo de migration recém-criado (ex: 20251007..._create_funcionarios_table.js)

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('funcionarios', (table) => {
        table.increments('id').primary();
        table.string('nome_completo').notNullable();
        table.string('cpf').notNullable().unique();
        table.decimal('salario_base', 10, 2).notNullable();
        table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('funcionarios');
};