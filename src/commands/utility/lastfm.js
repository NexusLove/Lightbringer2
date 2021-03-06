const { stripIndent } = require('common-tags')
const LCommand = require('./../../struct/LCommand')
const Logger = require('./../../util/Logger')
const querystring = require('querystring')

// Timeout between each polls to Last.fm
const POLL_TIMEOUT = 5000

// Maximum amount of consecutive errors
const MAX_RETRY = 3

const ACTIVITY_TYPES = {
  PLAYING: /^p(lay(ing)?)?$/i,
  STREAMING: /^s(tream(ing)?)?$/i,
  LISTENING: /^l(isten(ing( to)?)?)?$/i,
  WATCHING: /^w(atch(ing)?)?$/i
}

class LastfmCommand extends LCommand {
  constructor () {
    super('lastfm', {
      aliases: ['lastfm'],
      description: 'Manage Last.fm scrobbling status updater.',
      args: [
        {
          id: 'toggle',
          match: 'flag',
          flag: ['--toggle', '-t'],
          description: 'Toggle Last.fm polls. State will be saved.'
        },
        {
          id: 'toggleRich',
          match: 'flag',
          flag: ['--rich', '-r'],
          description: 'Toggle Rich Presence. State will be saved.'
        },
        {
          id: 'monitorMode',
          match: 'flag',
          flag: ['--monitorMode', '-m'],
          description: 'When Monitor Mode is enabled, it will keep on polling Last.fm and posting status update to status channel, but it will no longer update the user\'s status message. This may be useful when you want to temporarily use Spotify client on Desktop (usually the bot\'s activity message will override your own client\'s).'
        },
        {
          id: 'apiKey',
          match: 'option',
          flag: ['--apiKey=', '--api=', '--key='],
          description: 'Saves your Last.fm Developer API key.'
        },
        {
          id: 'username',
          match: 'option',
          flag: ['--username=', '--user='],
          description: 'Saves your Last.fm username (required to use the API).'
        },
        {
          id: 'clientID',
          match: 'option',
          flag: ['--clientID=', '--client='],
          description: 'Saves the Client ID of your Discord API Application (Rich Presence).'
        },
        {
          id: 'largeImageID',
          match: 'option',
          flag: ['--largeImage=', '--large='],
          description: 'Saves the ID of the "large image" (Rich Presence).'
        },
        {
          id: 'smallImageID',
          match: 'option',
          flag: ['--smallImage=', '--small='],
          description: 'Saves the ID of the "small image" (Rich Presence).'
        },
        {
          id: 'type',
          match: 'option',
          flag: ['--type='],
          description: 'Sets the activity type. Try "setactivity --list" to see available types.',
          type: (word, message, args) => {
            const keys = Object.keys(ACTIVITY_TYPES)
            for (const key of keys)
              if (ACTIVITY_TYPES[key].test(word)) return key
          }
        },
        {
          id: 'clearOption',
          match: 'option',
          flag: ['--clearOption=', '--clear=', '-c='],
          description: 'ID of the option to clear.'
        }
      ],
      usage: 'lastfm [ --toggle | --rich | [--apiKey=] [--username=] [--clientID=] [--largeImage=] [--smallImage=] [--type=] ]'
    })

    // Multiple options may be set at a time
    this._storageKeys = ['apiKey', 'username', 'clientID', 'largeImageID', 'smallImageID', 'type']

    this.storage = null

    // Total scrobbles fetched from Last.fm
    this.totalScrobbles = 0

    // Currently playing song
    this.artist = null
    this.trackName = null
    this.timestamp = null

    // Timeout instance
    this._timeout = null

    // Total consecutive errors
    this._error = 0
  }

  async run (message, args) {
    // Can only toggle one option at a time
    const toggles = [
      { arg: 'toggle', key: 'enabled', string: 'Last fm status updater' },
      { arg: 'toggleRich', key: 'rich', string: 'Rich Presence', alwaysPoll: true },
      { arg: 'monitorMode', key: 'monitorMode', string: 'Monitor Mode' }
    ]

    for (const toggle of toggles)
      if (args[toggle.arg]) {
        const val = Boolean(this.storage.get(toggle.key))
        this.storage.set(toggle.key, !val)
        this.storage.save()

        this.clearRecentTrackTimeout()
        if (this.storage.get('enabled'))
          await this.getRecentTrack()
        else
          await this.client.user.setPresence({ activity: null })

        return message.status('success', `${!val ? 'Enabled' : 'Disabled'} ${toggle.string}.`)
      }

    let storageHit
    this._storageKeys.forEach(key => {
      if (args[key] !== null) {
        this.storage.set(key, args[key])
        storageHit = true
      }
    })

    if (storageHit) {
      this.storage.save()
      if (this.storage.get('enabled')) await this.getRecentTrack()
      return message.status('success', 'Successfully saved the new value(s).')
    }

    if (args.clearOption) {
      const val = this.storage.get(args.clearOption)
      if (val === undefined) {
        return message.status('error', `Option with ID \`${args.clearOption}\` was not set.`)
      } else {
        this.storage.set(args.clearOption, null)
        if (this.storage.get('enabled')) await this.setPresenceFromStorage()
        return message.status('success', `Cleared option with ID \`${args.clearOption}\`.`)
      }
    }

    return message.edit('🎵\u2000Last fm configuration preview:\n' + this.client.util.formatCode(stripIndent`
      Artist          :: ${this.artist}
      Track name      :: ${this.trackName}
      Username        :: ${this.storage.get('username')}
      Total scrobbles :: ${this.totalScrobbles}
      Enabled         :: ${String(this.storage.get('enabled'))}
      Rich Presence   :: ${String(this.storage.get('rich'))}
      Large Image     :: ${String(this.storage.get('largeImageID'))}
      Small Image     :: ${String(this.storage.get('smallImageID'))}
      Monitor Mode    :: ${String(this.storage.get('monitorMode'))}
      Activity Type   :: ${this.getActivityType()}
    `, 'asciidoc'))
  }

  setPresenceToTrack () {
    if (!this.artist || !this.trackName)
      return

    const rich = this.storage.get('rich')
    const clientID = this.storage.get('clientID')
    const username = this.storage.get('username')

    if (rich && clientID)
      return this.client.user.setPresence({
        activity: {
          application: clientID,
          name: 'Last.fm',
          type: this.getActivityType(),
          details: `${this.trackName} by ${this.artist}`,
          state: `${this.totalScrobbles.toLocaleString()} scrobbles`,
          assets: {
            largeImage: this.storage.get('largeImageID') || null,
            smallImage: this.storage.get('smallImageID') || null,
            largeText: `${username}`,
            smallText: 'Powered by Lightbringer2'
          },
          timestamps: {
            start: this.timestamp
          }
        }
      })

    return this.client.user.setPresence({
      activity: {
        name: `${this.artist} – ${this.trackName} | ♪ Last.fm`,
        type: this.getActivityType()
      }
    })
  }

  async getRecentTrack () {
    if (!this.storage.get('enabled') || !this.storage.get('username') || !this.storage.get('apiKey'))
      return

    const _querystring = querystring.stringify({
      method: 'user.getrecenttracks',
      format: 'json',
      user: this.storage.get('username'),
      api_key: this.storage.get('apiKey'),
      limit: 1
    })
    const result = await this.client.util.fetch(`http://ws.audioscrobbler.com/2.0/?${_querystring}`, undefined, false)

    if (result.status !== 200) {
      Logger.error(result.message || result.text, { tag: this.id })
      return this.setRecentTrackTimeout(true)
    }

    const tracks = this.client.util.getProp(result, 'body.recenttracks.track')

    if (!tracks || !tracks.length)
      return this.setRecentTrackTimeout()

    this.totalScrobbles = Number(result.body.recenttracks['@attr'].total) || this.totalScrobbles

    const track = tracks[0]
    const isNowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true'

    let artist = null
    let trackName = null
    let timestamp = null

    if (isNowPlaying) {
      artist = typeof track.artist === 'object' ? track.artist['#text'] : track.artist
      trackName = track.name
      timestamp = new Date().getTime() - Math.ceil(POLL_TIMEOUT / 1000 / 2)
    }

    if (this.trackName === trackName && this.artist === artist)
      return this.setRecentTrackTimeout()

    try {
      if (!artist || !trackName) {
        this.artist = null
        this.trackName = null
        this.timestamp = null
        await this.client.user.setPresence({ activity: null })
        await this.client.util.sendStatus('🎵\u2000Cleared Last fm status message.')
      } else {
        const monitorMode = this.storage.get('monitorMode')
        this.artist = artist
        this.trackName = trackName
        this.timestamp = timestamp
        if (!monitorMode) await this.setPresenceToTrack()
        await this.client.util.sendStatus(`🎵\u2000Last fm${monitorMode ? ' [M] ' : ''}: ${artist} – ${trackName}`)
      }
      return this.setRecentTrackTimeout()
    } catch (error) {
      Logger.error(error, { tag: this.id })
      return this.setRecentTrackTimeout(true)
    }
  }

  setRecentTrackTimeout (isError) {
    if (!this.storage.get('enabled'))
      return

    if (MAX_RETRY !== undefined && MAX_RETRY > 0) {
      if (isError)
        this._error += 1
      else
        this._error = 0

      if (this._error >= 3) {
        this.clearRecentTrackTimeout()
        Logger.error(`Stopped due to ${MAX_RETRY} consecutive errors.`, { tag: this.id })
        this.client.util.sendStatus(`🎵\u2000Last fm status updater stopped due to **${MAX_RETRY}** consecutive errors.`)
        this.storage.set('enabled', false)
        this.storage.save()
        return
      }
    }

    this._timeout = this.client.setTimeout(() => this.getRecentTrack(), POLL_TIMEOUT)
  }

  clearRecentTrackTimeout () {
    this.artist = null
    this.trackName = null
    this.client.clearTimeout(this._timeout)
  }

  getActivityType () {
    return this.storage.get('type') || 'LISTENING'
  }

  onReady () {
    this.storage = this.client.storage('lastfm')

    if (this.storage.get('enabled') === undefined) {
      this.storage.set('enabled', true)
      this.storage.save()
    }

    if (this.storage.get('enabled')) {
      this._statusChannel = this.client.channels.get(this.storage.get('statusChannel')) || null
      this.getRecentTrack()
    }
  }

  onReload () {
    this.onRemove()
  }

  onRemove () {
    this.clearRecentTrackTimeout()
    this.storage.save()
  }
}

module.exports = LastfmCommand
