module.exports = {
  apps: [{
    name: 'stratbot',
    script: 'nest start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      PORT: 8085,
      NODE_ENV: 'development'
    },
    env_production: {
      PORT: 8085,
      NODE_ENV: 'production'
    }
  }]
};