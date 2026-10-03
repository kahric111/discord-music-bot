require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Player, QueryType } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = new Player(client, {
    ytdlOptions: {
        filter: 'audioonly',
        highWaterMark: 1 << 25,
        quality: 'highestaudio'
    }
});

player.extractors.loadMulti(DefaultExtractors);

player.events.on('error', (queue, error) => {
    console.log(`[Greška u redu]: ${error.message}`);
});

player.events.on('playerError', (queue, error, track) => {
    console.log(`[Greška pri reprodukciji]: ${error.message}`);
    if (queue.metadata) {
        queue.metadata.send(`Došlo je do greške pri reprodukciji: **${track.title}**`);
    }
});

client.once('ready', () => {
    console.log(`Bot je mrežan! Prijavljen kao ${client.user.tag}`);
});

const PREFIX = '!';

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('Morate biti u glasovnom kanalu!');

        const query = args.join(' ');
        if (!query) return message.reply('Unesite naziv pjesme ili URL!');

        const queue = player.nodes.create(message.guild, {
            metadata: message.channel,
            leaveOnEnd: false,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 300000
        });

        try {
            if (!queue.connection) await queue.connect(voiceChannel);
        } catch (err) {
            queue.delete();
            return message.reply('Ne mogu se pridružiti vašem glasovnom kanalu!');
        }

        // Primarno pretraživanje preko SoundCloud-a radi izbjegavanja YouTube IP blokada
        const result = await player.search(query, {
            requestedBy: message.author,
            searchEngine: QueryType.SOUNDCLOUD_SEARCH
        });

        if (!result || !result.tracks.length) {
            return message.reply('Pjesma nije pronađena na SoundCloud-u!');
        }

        result.playlist ? queue.addTrack(result.tracks) : queue.addTrack(result.tracks[0]);
        if (!queue.node.isPlaying()) await queue.node.play();

        return message.reply(`Dodano na listu: **${result.tracks[0].title}**`);
    }

    const queue = player.nodes.get(message.guild);
    if (!queue || !queue.node.isPlaying()) {
        if (['pause', 'resume', 'skip', 'stop', 'queue'].includes(command)) {
            return message.reply('Trenutno se ne reprodukuje nijedna pjesma.');
        }
    }

    if (command === 'pause') {
        queue.node.pause();
        return message.reply('Muzika je pauzirana.');
    }

    if (command === 'resume') {
        queue.node.resume();
        return message.reply('Muzika je nastavljena.');
    }

    if (command === 'skip') {
        queue.node.skip();
        return message.reply('Pjesma je preskočena!');
    }

    if (command === 'stop') {
        queue.delete();
        return message.reply('Muzika je zaustavljena i lista je očišćena.');
    }

    if (command === 'queue') {
        const tracks = queue.tracks.toArray();
        const currentTrack = queue.currentTrack;

        if (!currentTrack) return message.reply('Nema pjesama u listi.');

        let queueList = `**Trenutno svira:** ${currentTrack.title}\n\n**Slijedi:**\n`;
        tracks.slice(0, 10).forEach((track, i) => {
            queueList += `${i + 1}. ${track.title}\n`;
        });

        return message.reply(queueList);
    }
});

client.login(process.env.DISCORD_TOKEN);
