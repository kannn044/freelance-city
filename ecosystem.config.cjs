module.exports = {
  apps: [
    {
      name: 'freelance-city-server',
      cwd: './server',
      script: 'dist/server/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'freelance-city-client',
      cwd: './client',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 4173',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
