const { CollegiateDictionary, WordNotFoundError } = require('mw-dict')
const LCommand = require('./../../struct/LCommand')
const Logger = require('./../../util/Logger')

class DictionaryCommand extends LCommand {
  constructor () {
    super('dictionary', {
      aliases: ['dictionary', 'dict'],
      description: 'Looks up a word on Merriam-Webster.',
      args: [
        {
          id: 'index',
          type: 'integer',
          match: 'option',
          flag: ['--index=', '-i='],
          description: 'Sets index of which definition to show.'
        },
        {
          id: 'more',
          match: 'flag',
          flag: ['--more', '-m'],
          description: 'Lists the rest of the search result if available.'
        },
        {
          id: 'next',
          match: 'flag',
          flag: ['--next', '-n'],
          description: 'Shows the next definition of the last used keyword.'
        },
        {
          id: 'keyword',
          match: 'rest'
        },
        {
          id: 'apiKey',
          match: 'option',
          flag: ['--apikey=', '--api=', '--key='],
          description: 'Saves your Merriam-Webster\'s Collegiate® Dictionary API key.'
        }
      ],
      usage: 'dictionary < [--index=] [--more] <keyword> | --apikey= >',
      selfdestruct: 60,
      clientPermissions: ['EMBED_LINKS']
    })

    this.storage = null

    this.dictClient = null

    this.lastKeyword = null

    this.lastIndex = null
  }

  async run (message, args) {
    if (args.apiKey) {
      this.storage.set('apiKey', args.apiKey)
      this.storage.save()
      return message.status('success', 'Successfully saved the API key.')
    }

    if (!this.storage.get('apiKey'))
      return message.status('error', 'Missing API key!\nGet your Merriam-Webster\'s Collegiate® Dictionary API key from **http://dictionaryapi.com/** then run `dict --key=<apiKey>` to save the API key!', -1)

    if (!this.dictClient)
      await this.initDictClient()

    let keyword = args.keyword
    let index = args.index !== null ? (args.index - 1) : 0

    if (!args.keyword && !args.next)
      return message.status('error', 'You must specify something to search.')

    if (args.next)
      if (this.lastKeyword) {
        keyword = this.lastKeyword
        index = (this.lastIndex || 0) + 1
      } else {
        return message.status('error', 'You have not previously used the command to look up a definition.')
      }

    await message.status('progress', `Searching for \`${keyword}\` on Merriam-Webster\u2026`)

    let result
    try {
      result = await this.dictClient.lookup(keyword)
    } catch (error) {
      if (error instanceof WordNotFoundError)
        return message.edit(`⛔\u2000\`${keyword}\` was not found!`, {
          embed: this.client.util.embed({
            title: 'Suggestions',
            description: error.suggestions.join('; '),
            footer: {
              text: 'Merriam-Webster\'s Collegiate® Dictionary',
              icon: 'https://i.fiery.me/ucGj.png'
            },
            color: '#ff0000'
          })
        })
      else
        throw new Error(error) // Re-throw to let commandError listener to handle it
    }

    const selected = result[index]
    if (!selected)
      return message.status('error', `Index \`${index + 1}\` of the search result is unavailable.`)

    await this.displayDefinition(message, index, result, keyword, args.more)

    this.lastKeyword = keyword
    this.lastIndex = index
  }

  async displayDefinition (message, index, result, keyword, more) {
    const selected = result[index]
    const embed = {
      title: selected.word + (selected.functional_label ? ` (${selected.functional_label})` : ''),
      description: selected.definition.map(d => {
        // Italicize any word matching the currently defined word
        return this.beautify(d).replace(new RegExp(`\\b${selected.word}\\b`), `*${selected.word}*`)
      }).join('\n'),
      fields: [
        {
          name: 'Link',
          value: `**https://www.merriam-webster.com/dictionary/${selected.word.replace(/ /g, '+')}**`
        }
      ],
      footer: {
        text: `Merriam-Webster's Collegiate® Dictionary | ${this.sd(true)}`,
        icon: 'https://i.fiery.me/ucGj.png'
      },
      color: '#2d5f7c'
    }

    if (result.length > 1 && more)
      embed.fields.push({
        name: 'More',
        value: result
          .map((r, i) => i !== index ? `**${i + 1}** : ${r.word}` : null)
          .filter(r => r) // filter null
          .join('\n') +
          '\n\n*Use --index=<index> to display definition of search result with a specific index.*'
      })

    return message.edit(
      `Search result of \`${keyword}\` at \`${index + 1}/${result.length}\` on Merriam-Webster:`, {
        embed: this.client.util.embed(embed)
      }
    )
  }

  beautify (m, depth = 0) {
    let temp = ''
    const hasContent = m.meanings || m.synonyms || m.illustrations || m.senses

    if (m.senses && (m.senses.findIndex(s => s.number === m.number) !== -1))
      // Skip current Sense if it has additional Senses
      // in which the current Sense exist
      // This is a workaround for a particular bug in mw-dict library
      return m.senses.map(s => this.beautify(s, depth)).join('\n')

    temp += '    '.repeat(depth)

    if (m.number)
      if (/^\(\d+?\)$/.test(m.number)) {
        temp += m.number + ' '
      } else {
        temp += `**${m.number}** `
      }

    if (m.status)
      temp += m.status + ' '

    if (!hasContent) {
      Logger.log(require('util').inspect(m), { tag: this.id })
      return temp + '*This meaning may not have any content. Check your console\u2026*'
    }

    if (m.meanings)
      temp += m.meanings.map((m, i, a) => {
        // Trim whitespaces (some meanings have unexpected whitespace)
        m = m.trim()

        if (m.includes(':'))
          // Format semicolons
          m = m.split(':').map(m => m.trim()).join(' : ').trim()
        else
          // Italicizes if the meaning does not start with a colon (:)
          m = `*${m}*`

        // Starts meaning with a semicolon (;) if it does not start with
        // a colon (:) and there was a precedent meaning
        if (!m.startsWith(':') && a[i - 1] !== undefined)
          m = `; ${m}`

        return m
      }).join(' ')

    if (m.synonyms) {
      // Adds an extra whitespace if there was
      // a meaning that ends with semicolon (;)
      if (temp.endsWith(':'))
        temp += ' '

      // Underlines all synonyms
      temp += m.synonyms.map(s => `__${s.trim()}__`).join(', ')
    }

    if (m.illustrations)
      temp += ' ' + m.illustrations.map(i => `\u2022 ${i}`).join(' ')

    if (m.senses) {
      depth++
      temp += '\n' + m.senses.filter((s, i, a) =>
        // Filter duplicate which have the same number but lack additional Senses
        // This is a workaround for a particular bug in mw-dict library
        a.findIndex(_s => (_s.number === s.number) && _s.senses && !s.senses) !== 1
      ).map(s => this.beautify(s, depth)).join('\n')
    }

    return temp.replace(/\s*$/g, '')
  }

  async initDictClient () {
    this.dictClient = await new CollegiateDictionary(this.storage.get('apiKey'))
  }

  onReady () {
    this.storage = this.client.storage('dictionary')

    if (this.storage.get('apiKey'))
      this.initDictClient()
  }
}

module.exports = DictionaryCommand
