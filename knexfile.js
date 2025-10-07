// knexfile.js

module.exports = {
  // Configuração para o seu ambiente local
  development: {
    client: 'sqlite3',
    connection: {
      filename: './database.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  },

  // Configuração para o ambiente do Render (produção)
  production: {
    client: 'pg', // Cliente PostgreSQL
    connection: process.env.DATABASE_URL, // Usa a variável de ambiente do Render
    migrations: {
      directory: './database/migrations'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};