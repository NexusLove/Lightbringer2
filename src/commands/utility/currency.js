const { Command } = require('discord-akairo')
const mathjs = require('mathjs')
const moment = require('moment')

class CurrencyCommand extends Command {
  constructor () {
    super('currency', {
      aliases: ['exchangerate', 'currency', 'curr'],
      description: 'Converts currency using exchange rates from http://fixer.io/.',
      args: [
        {
          id: 'input',
          match: 'separate',
          type: 'uppercase',
          description: '<value> <from> <to>'
        },
        {
          id: 'refresh',
          match: 'flag',
          prefix: ['--refresh'],
          description: 'Refreshes the exchange rate.'
        },
        {
          id: 'source',
          match: 'flag',
          prefix: ['--source', '-s'],
          description: 'Displays the source of the exchange rate.'
        },
        {
          id: 'default',
          match: 'prefix',
          prefix: ['--default=', '-d='],
          type: 'uppercase',
          description: 'Sets default "to" currency.'
        }
      ],
      options: {
        usage: 'currency < input | --refresh | --source | --default= >',
        examples: [
          {
            content: 'currency 25 usd eur',
            description: 'Convert 25 USD to EUR.'
          },
          {
            content: 'currency 50 usd to eur',
            description: 'Optionally, if there is a "to" in between the two currencies, it will assume the string after it as the actual "to" currency". So it will convert 50 USD to EUR.'
          },
          {
            content: 'currency --default=usd',
            description: 'Sets default "to" currency to USD. So running something like "currency 50 eur" will convert 50 EUR to USD (since USD is the default "to" currency).'
          }
        ]
      }
    })

    // Exchange rates data fetched from fixer.io
    this.data = null

    // Default currency
    this.default = null

    // Timeout instance
    this._timeout = null

    // Is it still updating exchange rates
    this._updatingRates = false
  }

  async exec (message, args) {
    if (args.source) {
      return message.edit('ℹ\u2000Exchange rate provided by http://fixer.io/.')
    }

    if (!this.data || args.refresh) {
      await message.status('progress', 'Updating exchange rate\u2026')
      await this.updateRates()

      if (args.refresh) {
        return message.status('success', 'Successfully updated exchange rate.')
      }
    }

    const base = this.data.base
    const rates = this.data.rates

    if (args.default) {
      const curr = args.default
      if (rates[curr] === undefined && curr !== base) {
        return message.status('error', `Currency \`${curr}\` is unavailable.`)
      }
      this.default = args.default
      return message.status('success', `Successfully updated default currency to \`${this.default}\`.`)
    }

    if (!args.input || args.input.length < 2) {
      return message.status('error', `Usage: \`${this.options.usage}\`.`)
    }

    const val = parseFloat(args.input[0])
    if (isNaN(val)) {
      return message.status('error', 'Invalid value.')
    }

    const curr1 = args.input[1]
    let curr2 = args.input[2]

    // If the 2nd input is "to", then expect the 2nd currency to be in the 3rd input
    if (/^to$/i.test(curr2)) {
      curr2 = args.input[3]
    }

    if (!curr2 && this.default) {
      curr2 = this.default
    }

    console.log(curr2)

    if (!curr2) {
      return message.status('error', 'Missing "to" currency.')
    }

    for (const curr of [curr1, curr2]) {
      if (rates[curr] === undefined && curr !== base) {
        return message.status('error', `Currency \`${curr}\` is unavailable.`)
      }
    }

    let sum = val

    if (curr1 !== base) {
      sum /= rates[curr1]
    }

    if (curr2 !== base) {
      sum *= rates[curr2]
    }

    const lHand = `${mathjs.round(val, 2).toLocaleString()} ${curr1}`
    const rHand = `${mathjs.round(sum, 2).toLocaleString()} ${curr2}`

    return message.edit(`💸\u2000|\u2000${lHand} = **${rHand}**`)
  }

  async updateRates () {
    // Allowing only 1 running instance of this function
    if (this._updatingRates) {
      return new Promise(resolve => setInterval(() => {
        if (!this._updatingRates) { resolve() }
      }, 1000))
    }

    this._updatingRates = true

    const result = await this.client.util.snek('https://api.fixer.io/latest', {
      query: {
        base: 'USD'
      }
    })
    if (result.status !== 200) {
      throw new Error(result.text)
    }

    this.data = result.body

    // Next day, 17:00 UTC +1 (5PM CET)
    // fixer.io updates their data around 4PM CET
    const nextTimestamp = moment()
      .utcOffset('+01')
      .startOf('day')
      .add(1, 'd')
      .set('h', 17)
      .valueOf()
    this._timeout = this.client.setTimeout(() => {
      this.updateRates()
    }, nextTimestamp - new Date())

    this._updatingRates = false
  }

  onReady () {
    this.storage = this.client.storage('currency')
    this.default = this.storage.get('default')
    if (!this.default) { this.default = null }

    this.updateRates().catch(error => {
      console.error(`[currency] ${error}`)
    })
  }

  onReload () {
    this.onRemove()
  }

  onRemove () {
    this.client.clearTimeout(this._timeout)
  }
}

module.exports = CurrencyCommand
