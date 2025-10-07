// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './database.db' // O arquivo do nosso banco de dados local
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  },

  production: { // Já vamos deixar a configuração de produção pronta
    client: 'pg', // PostgreSQL para o Supabase
    connection: process.env.DATABASE_URL, // Usará a variável de ambiente no Render
    migrations: {
      directory: './database/migrations'
    }
  }
};