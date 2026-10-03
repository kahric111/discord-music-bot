require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

// Inicijalizacija Discord klijenta sa potrebnim dozvolama
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Inicijalizacija muzičkog plejera sa opcijama za stabilniju reprodukciju
const player = new Player(client, {
    ytdlOptions: {
        filter: 'audioonly',
        highWaterMark: 1 << 25,
        quality: 'highestaudio'
    }
});

// Učitavanje ekstrakcija izvora zvuka (YouTube, Spotify, SoundCloud, itd.)
player.extractors.loadMulti(DefaultExtractors);

// Praćenje grešaka unutar plejera kako bot ne bi izlazio iz kanala pri grešci
player.events.on('error', (queue, error) => {
    console.log(`[Greška u redu]: ${error.message}`);
});

player.events.on('playerError', (queue, error, track) => {
    console.log(`[Greška pri reprodukciji]: ${error.message}`);
    if (queue.metadata) {
        queue.metadata.send(`Došlo je do greške pri reprodukciji pjesme: **${track.title}**`);
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

    // Komanda za puštanje muzike
    if (command === 'play' || command === 'p') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('Morate biti u glasovnom kanalu!');

        const query = args.join(' ');
        if (!query) return message.reply('Unesite naziv pjesme ili URL!');

        const queue = player.nodes.create(message.guild, {
            metadata: message.channel,
            leaveOnEnd: false,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 300000 // Izlazi iz kanala tek nakon 5 minuta prazne sobe
        });

        try {
            if (!queue.connection) await queue.connect(voiceChannel);
        } catch (err) {
            queue.delete();
            return message.reply('Ne mogu se pridružiti vašem glasovnom kanalu!');
        }

        const result = await player.search(query, { requestedBy: message.author });
        if (!result || !result.tracks.length) return message.reply('Pjesma nije pronađena!');

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

    // Komanda za pauziranje
    if (command === 'pause') {
        queue.node.pause();
        return message.reply('Muzika je pauzirana.');
    }

    // Komanda za nastavak
    if (command === 'resume') {
        queue.node.resume();
        return message.reply('Muzika je nastavljena.');
    }

    // Komanda za preskakanje pjesme
    if (command === 'skip') {
        queue.node.skip();
        return message.reply('Pjesma je preskočena!');
    }

    // Komanda za zaustavljanje i izlazak
    if (command === 'stop') {
        queue.delete();
        return message.reply('Muzika je zaustavljena i lista je očišćena.');
    }

    // Komanda za pregled liste čekanja
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
