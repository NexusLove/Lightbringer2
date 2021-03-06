const { escapeMarkdown } = require('discord.js').Util
const { stripIndent } = require('common-tags')
const convert = require('color-convert')
const LCommand = require('./../../struct/LCommand')

class RoleInfoCommand extends LCommand {
  constructor () {
    super('roleinfo', {
      aliases: ['roleinfo', 'rinfo', 'role'],
      description: 'Shows information of a specific role.',
      split: 'sticky',
      args: [
        {
          id: 'guild',
          match: 'option',
          flag: ['--guild=', '-g='],
          description: 'Tries to display information of a role from a specific guild instead.'
        },
        {
          id: 'keyword',
          match: 'rest',
          description: 'The role that you want to display the information of.'
        }
      ],
      usage: 'roleinfo [--guild=] <keyword>',
      selfdestruct: 60,
      clientPermissions: ['EMBED_LINKS']
    })
  }

  async run (message, args) {
    if (!args.keyword)
      return message.status('error', 'You must specify a role name.')

    const roleSource = args.guild || message.guild || null
    if (!roleSource)
      return message.status('error', 'You must be in a guild to run this command without "--guild" flag.')

    // Assert Role.
    const role = await this.client.util.assertRole(args.keyword, roleSource)

    // Check whether the keyword was a mention or not.
    const mention = args.keyword && this.client.util.isKeywordMentionable(args.keyword, 1)

    const online = role.members.filter(m => m.presence.status !== 'offline')

    const embed = {
      title: role.name,
      description: `**Guild:** ${escapeMarkdown(role.guild.name)} (ID: ${role.guild.id})`,
      fields: [
        {
          name: 'Information',
          value: stripIndent`
              •  **ID:** ${role.id}
              •  **Created on:** ${this.client.util.formatFromNow(role.createdAt)}
              •  **Position:** ${role.guild.roles.size - role.position} out of ${role.guild.roles.size}
              •  **Members:** ${role.members.size} – ${online.size} online
            `
        },
        {
          name: 'Miscellaneous',
          value: stripIndent`
              •  **Hex color:** ${role.hexColor}
              •  **RGB color:** (${convert.hex.rgb(role.hexColor).join(', ')})
              •  **Hoist:** ${this.client.util.formatYesNo(role.hoist)}
              •  **Managed:** ${this.client.util.formatYesNo(role.managed)}
              •  **Mentionable:** ${this.client.util.formatYesNo(role.mentionable)}
          `
        }
      ],
      color: role.color !== 0 ? role.hexColor : null,
      footer: `Use "memfetch" to refresh members cache | ${this.sd(true)}`
    }

    // Message content (the thing being displayed above the embed).
    let content = `Information of the role matching keyword \`${args.keyword}\`:`
    if (mention)
      content = `${role}'s information:`

    await message.edit(content, {
      embed: this.client.util.embed(embed)
    })
  }
}

module.exports = RoleInfoCommand
