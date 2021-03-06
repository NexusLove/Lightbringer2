const { MessageStore } = require('discord.js')
const { stripIndent } = require('common-tags')
const LCommand = require('./../../struct/LCommand')
const os = require('os')

class StatsCommand extends LCommand {
  constructor () {
    super('stats', {
      aliases: ['statistics', 'stats'],
      description: 'Shows you stats about Lightbringer.',
      selfdestruct: 60,
      clientPermissions: ['EMBED_LINKS']
    })

    this.git = null
  }

  async run (message, args) {
    let modules = 0
    modules += this.client.commandHandler.modules.size
    modules += this.client.inhibitorHandler.modules.size
    modules += this.client.listenerHandler.modules.size

    const members = this.client.guilds.reduce((a, v) => a + v.members.size, 0)
    const messages = this.client.channels.reduce((a, v) => {
      if (!(v.messages instanceof MessageStore)) return a
      return a + v.messages.size
    }, 0)

    let version = this.client.data.package.version
    const author = {
      name: 'Lightbringer Statistics',
      icon: 'https://i.fiery.me/Ec8h.png'
    }

    if (this.git) {
      version = `[${version}](${this.git})`
      author.url = this.git
    }

    const platform = os.platform()

    const embed = {
      fields: [
        {
          name: 'Lightbringer2',
          value: stripIndent`
            •  **Version:** ${version}
            •  **Modules:** ${modules.toLocaleString()}
            •  **Prefix:** \`${this.client.commandHandler.prefix}\`
            •  **Uptime:** ${this.client.util.humanizeDuration(Date.now() - this.client.startTimestamp, null, true)}
            •  **Memory usage:** ${this.client.util.getPrettyBytes(process.memoryUsage().rss)}
            •  **Heartbeat:** \`${this.client.ping.toFixed(0)}ms\`
          `
        },
        {
          name: 'System',
          value: stripIndent`
            •  **Node.js:** [${process.versions.node}](${process.release.sourceUrl})
            •  **discord.js:** [${require('discord.js').version}](https://github.com/hydrabolt/discord.js)
            •  **discord-akairo:** [${require('discord-akairo').version}](https://github.com/1Computer1/discord-akairo)
            •  **Platform:** ${platform}-${os.arch()}
            •  **Uptime:** ${this.client.util.humanizeDuration(os.uptime * 1000, null, true)}
          `
        },
        {
          name: 'Statistics',
          value: stripIndent`
            •  **Guilds:** ${this.client.guilds.size.toLocaleString()}
            •  **Channels:** ${this.client.channels.size.toLocaleString()}
            •  Sent **${this.client.stats.get('messages-sent').toLocaleString()}** message${this.client.stats.get('messages-sent') === 1 ? '' : 's'}
            •  Executed **${this.client.stats.get('commands-started').toLocaleString()}** command${this.client.stats.get('commands-started') === 1 ? '' : 's'}
            •  Received **${this.client.stats.get('messages-received').toLocaleString()}** message${this.client.stats.get('messages-received') === 1 ? '' : 's'}
            •  Mentioned **${this.client.stats.get('mentions').toLocaleString()}** time${this.client.stats.get('mentions') === 1 ? '' : 's'}
            •  Caching **${this.client.users.size.toLocaleString()}** user${this.client.users.size === 1 ? '' : 's'}
            •  Caching **${members.toLocaleString()}** member${members === 1 ? '' : 's'}
            •  Caching **${messages.toLocaleString()}** message${messages === 1 ? '' : 's'}
          `
        }
      ],
      inline: true,
      author,
      color: '#ff0000',
      footer: `${this.sd(true)}`
    }

    if (platform === 'linux') {
      const memoryUsage = await this.client.util.getLinuxMemoryUsage()
      embed.fields[1].value += '\n' + stripIndent`
        •  **Memory:** ${this.client.util.getPrettyBytes(memoryUsage.mem.used)} / ${this.client.util.getPrettyBytes(memoryUsage.mem.total)} (${Math.round((memoryUsage.mem.used / memoryUsage.mem.total) * 100)}%)
      `
    }

    if (platform !== 'win32')
      embed.fields[1].value += '\n' + stripIndent`
        •  **Load average:** ${os.loadavg().map(load => load.toFixed(2)).join(', ')}
      `

    await message.edit(message.content, {
      embed: this.client.util.embed(embed)
    })
  }

  onReady () {
    if (this.client.data.package.repository)
      this.git = `https://github.com/${this.client.data.package.repository.replace(/^github:/, '')}`
  }
}

module.exports = StatsCommand
