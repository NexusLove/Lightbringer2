const ConfigManager = require('./struct/ConfigManager')
const LightbringerClient = require('./struct/LightbringerClient')
const Logger = require('./struct/Logger')

const logger = new Logger()
logger.inject()

const configManager = new ConfigManager('./config.json')
const config = configManager.load()

if (config.token) {
  const client = new LightbringerClient(
    {
      selfbot: true,
      allowMention: false,
      automateCategories: true,
      emitters: {
        process
      },
      prefix: config.prefix || 'lb',
      commandDirectory: './src/commands/',
      inhibitorDirectory: './src/inhibitors/',
      listenerDirectory: './src/listeners/',
      storageDirectory: './storage/',
      configManager,
      statusTimeout: 7500, // timeout for status messages of all commands (success, error, question and progress)
      purgeCommandsTimeout: 2500 // timeout for success messages of flush, prune and purge commands
    },
    {
      messageCacheMaxSize: 10, // maximum number of messages to cache per channel
      sync: true, // sync guilds every 30 seconds
      disabledEvents: [ // disable some websocket events to potentially increase overall performance
        'CHANNEL_PINS_UPDATE',
        'MESSAGE_REACTION_ADD',
        'MESSAGE_REACTION_REMOVE',
        'MESSAGE_REACTION_REMOVE_ALL',
        'VOICE_STATE_UPDATE',
        'TYPING_START'
      ]
    }
  )

  console.log('Logging in\u2026')
  client.login(config.token)
} else {
  console.info('Token is missing from the configuration file.')
  console.info('Please edit the configuration file then start the bot again.')
  process.exit(1)
}
