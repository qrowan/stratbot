module.exports = {
  apps: [{
    name: 'trading-bot',
    script: 'npx @nestjs/cli start',
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