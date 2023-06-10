// === IMPORTS & GLOBALS ===

// Node internals
const { Buffer } = require('node:buffer');

// DiscordJS stuff
const { Client, Intents, Permissions, MessageAttachment} = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Project resources
const Database = require('./database.js');
const { 
    db_path, 
    clientId, 
    guildId, 
    token, 
    unsplash_key, 
    submission_channel, 
    eggspell_role, 
    contestant_role, 
    vote_emoji 
} = require('./config.json');


// Global variables
const database = new Database();
const client = new Client({ 
    'intents': [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS],
    'partials': ['MESSAGE', 'REACTION'] });
let message_ignore_list = {};


// === CORE ===

// Register guild slash commands with Discord
function deploy_commands(){
    const ban_permission_flag = Permissions.FLAGS.KICK_MEMBERS.toString();
    let commands = [];
    let cmd;

    // public commands
    commands.push(new SlashCommandBuilder().setName('submit').setDescription("Submit your egg drop challenge entry.")
        .addStringOption(option => option.setName('url').setDescription("Link to your submission video")
            .setRequired(true)).toJSON());
    commands.push(new SlashCommandBuilder().setName('egg').setDescription("A nice egg in this trying time.").toJSON());
    commands.push(new SlashCommandBuilder().setName('ping').setDescription("Check if i'm still alive and healthy.")
        .toJSON());

    // privileged commands
    cmd = new SlashCommandBuilder().setName('eggspell').setDescription("Ban a user from submitting entries.")
                .addUserOption(option => option.setName('target').setDescription("The user to eggspell")
                    .setRequired(true))
                .addStringOption(option => option.setName('reason')
                    .setDescription("Why this user is excluded from participating."));
    cmd.defaultPermission = false;
    cmd = cmd.toJSON();
    cmd.default_member_permissions = ban_permission_flag;

    commands.push(cmd);

    cmd = new SlashCommandBuilder().setName('eggscuse').setDescription("Lift a submission ban.")
                .addUserOption(option => option.setName('target').setDescription("The user to eggscuse")
                    .setRequired(true));
    cmd.defaultPermission = false;
    cmd = cmd.toJSON();
    cmd.default_member_permissions = ban_permission_flag;
    commands.push(cmd);

    cmd = new SlashCommandBuilder().setName('submissions').setDescription("Manage submissions.")
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('close')
                            .setDescription("Disallow further submissions."))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('open')
                            .setDescription("Allow submissions."))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('download')
                            .setDescription("Create a .csv file containing the submissions collected so far."))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('clear')
                            .setDescription("Delete all recorded submissions.")
                            .addStringOption(option => option.setName('confirmation')
                                                    .setDescription("Type \"Delete everything please!\" to confirm.")
                                                    .setRequired(true)));
    cmd.defaultPermission = false;
    cmd = cmd.toJSON();
    cmd.default_member_permissions = ban_permission_flag;
    commands.push(cmd);
                        
    // register them
    const rest = new REST({ 'version': '9' }).setToken(token);
    rest.put(Routes.applicationGuildCommands(clientId, guildId), { 'body': commands })
        .then(() => console.log('Successfully registered application commands.'))
        .catch(console.error);
}

function run(){
    console.log('Starting');
    process.on('SIGINT', exit);
    database.start(db_path);
    deploy_commands();
    client.login(token);
}

function exit() {
    console.log('Shutting down');
    client.destroy();
    //database.exit();
    console.log('Goodbye');
    process.exit(0);
}


// === TOOLS ===

// Create a CSV containing all recorded submissions and returns them as a MessageAttachment object
async function create_csv(guildId){
    let submissions = await database.getSubmissions();
    if(submissions.length < 1){
        return;
    }

    function csvsafe(text){
        return text.replace('"',"'");
    }
    
    let csv_body = '"User ID","User name","Submission URL","User votes","timestamp","Message link"\r\n';
    submissions.forEach(submission => {
        let datetime = new Date(submission['timestamp']).toISOString();
        csv_body = `${csv_body}"${submission['userId']}","${csvsafe(submission['userName'])}","${csvsafe(submission['url'])}","${submission['userVotes']}","${datetime}","https://discord.com/channels/${guildId}/${submission_channel}/${submission['messageId']}"\r\n`;
    });
    
    let buf = Buffer.from(csv_body);
    return new MessageAttachment(buf, "submissions.csv");
}


// == INTERACTIONS ===

async function cmd_ping(interaction){
    let delay = Date.now() - interaction.createdTimestamp;
    await interaction.reply({'content': `Pong! ⏱️\`${delay}\``, 'ephemeral': true});
}

async function cmd_egg(interaction){
    // Replies with a link to a random image of an egg
    let unsplash_request = `https://api.unsplash.com/photos/random?query=egg&client_id=${unsplash_key}`;
    fetch(unsplash_request)
        .then(result => result.json())
        .then(async (reply) => {
            await interaction.reply({
                'content': reply.urls.regular, 
                'ephemeral': interaction.channelId == submission_channel});
        }).catch(async (error)=>{ 
            await interaction.reply({'content': `Failed to fetch you a fresh egg: ${error}`, 'ephemeral': true});
            console.error(`Failed to deliver egg: ${error}`);
        });
}

async function cmd_submit(interaction){
    
    if (interaction.channelId != submission_channel){
        await interaction.reply({'content': `Please submit your entry in <#${submission_channel}>!`, 'ephemeral': true});
        return;
    }

    if (await database.getSetting('submissions_open') !== 'true'){
        await interaction.reply({'content': `Submissions are currently closed.`, 'ephemeral': true});
        return;
    }

    if (interaction.member.roles.cache.has(eggspell_role)){
        await interaction.reply({
            'content': `You have been excluded from participation. If you believe this is in error, contact the mods.`, 
            'ephemeral': true});
        return;
    }

    // Validate the submission URL
    let url = interaction.options.getString('url');
    try {
        new URL(url);
    } catch (e) {
        interaction.reply({'content': "Your submission must be a valid url to a video hosting website.", 'ephemeral': true});
        return;
    }

    await interaction.deferReply(); // In case the database call takes more than 3 seconds, which could happen when we're queued up

    // Remove old submissions if any
    let messageId = await database.removeByUser(interaction.member.id);
    if(messageId){
		message_ignore_list[messageId] = true;
        await interaction.channel.messages.delete(messageId);
    }

    // Store the submission and thank the user
    let message = await interaction.followUp({'content': url}); // todo include randomised pun in the message
    await database.addSubmission(interaction.member.id, interaction.member.displayName, url, message.id, interaction.createdTimestamp)
    .catch(async error => {
        console.error(error);
        await interaction.deleteReply();
        await interaction.followUp({
            'content': "Failed to record your submission due to a database error, please try again. 😔", 
            'ephemeral': true});
        return;
    });
    
    await message.react(vote_emoji);
    await interaction.member.roles.add(contestant_role, "User submitted a contest entry.");
}

async function cmd_eggspell(interaction){
    interaction.deferReply({'ephemeral': true});

    let member = await interaction.options.getMember('target');
    let reason = await interaction.options.getString('reason');
    
    if(!reason){
        reason = "No reason given.";
    }
    
    // Assign the exclusion role, remove the participation role, delete from database and remove latest submission from the channel.
    reason = `${interaction.member.displayName}: ${reason}`;
    await member.roles.add(eggspell_role, reason);
    await member.roles.remove(contestant_role, reason);
    let messageId = await database.removeByUser(member.id);
    if(messageId){
        await interaction.channel.messages.delete(messageId);
    }
    await interaction.followUp({'content': 
        `<@${member.id}> is eggscluded from participation, and their submission has been removed, if any.`,
        'ephemeral': true});
}

async function cmd_eggscuse(interaction){
    let member = await interaction.options.getMember('target');
    member.roles.remove(eggspell_role, `${interaction.member.displayName}`);
    await interaction.reply({'content': `<@${member.id}> can participate eggain.`, 'ephemeral': true});
}

async function cmd_submissions_open(interaction){
    await database.setSetting('submissions_open', 'true');
    await interaction.reply({'content': "Submissions are now enabled!", 'ephemeral': true});
}

async function cmd_submissions_close(interaction){
    await database.setSetting('submissions_open', 'false');
    await interaction.reply({'content': "Submissions are now disabled!", 'ephemeral': true});
}

async function cmd_submissions_clear(interaction){
    let confirmation = await interaction.options.getString('confirmation');
    if (confirmation !== "Delete everything please!") {  // This phrase needs to be identical to the one in the description of the command specification at the top of this document.
        await interaction.reply({'content': "Incorrect confirmation. Have an eggcellent day.", 'ephemeral': true});
        return;
    }
    
    await interaction.deferReply();
    let attachment = await create_csv(interaction.guildId);
    await database.clearSubmissions();
    if(!attachment){
        await interaction.followUp({'content': "All submissions deleted from the database."});
    }else{
        await interaction.followUp({'content': "All submissions deleted from the database. Here's a copy, just in case.", 'files': [attachment]});
    }
    
}

async function cmd_submissions_download(interaction){
    await interaction.deferReply();
    
    let attachment = await create_csv(interaction.guildId);
    if(!attachment){
        await interaction.followUp({'content': "No submissions available."});
    }else{
        await interaction.followUp({'content': "There you go!", 'files': [attachment]});
    }
}


// === EVENTS ===

client.once('ready', () => {
    console.log('Ready!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    
    try{
        switch(commandName){
            case 'ping':
                await cmd_ping(interaction);
                break;
            case 'egg':
                await cmd_egg(interaction);
                break;
            case 'submit':
                await cmd_submit(interaction);
                break;
            case 'eggspell':
                await cmd_eggspell(interaction);
                break;
            case 'eggscuse':
                await cmd_eggscuse(interaction);
                break;
            case 'submissions':
                switch(interaction.options.getSubcommand()){
                    case 'open':
                        await cmd_submissions_open(interaction);
                        break;
                    case 'close':
                        await cmd_submissions_close(interaction);
                        break;
                    case 'clear':
                        await cmd_submissions_clear(interaction);
                        break;
                    case 'download':
                        await cmd_submissions_download(interaction);
                        break;
                }
                break;
            default:
                interaction.reply({'content': "This command is not implemented (yet).", 'ephemeral': true});
        }
    }catch (reason) {
        console.error(`Interaction command crashed: ${reason}`);
    }
    
});

client.on('messageCreate', async message => { // Remove all messages that aren't posted by me from the submission channel.
    if(message.channelId == '771078124162777098'){
        // If #crap-tank-ideas channel, apply the standard reactions
        await message.react('771114266501578752');
        await message.react('771114266455441428');
        await message.react('🤷');
        await message.react('772675960905793546');
        await message.react('⭐');
        
    }else if(message.channelId == submission_channel){
        // If #egg-submissions, remove messages from anyone but this bot
        if (message.partial) {
            try {
                await message.fetch();
            } catch (error) {
                console.error('Something went wrong when fetching message for create event:', error);
                return;
            }
        }

        if(message.author.id != client.user.id){
            await message.delete();
        }
    }
});

client.on('messageDelete', async message => { // When a user's latest submission gets deleted, also remove the entry from the database.
    if(message.channelId != submission_channel){
        return;
    }

	if(message.id in message_ignore_list){ // Already replaced with a new submission
		delete message_ignore_list[message.id];
		return;
	}
    
    let userId = await database.removeByMessage(message.id);
    if(!userId){
        return;
    }

    try{
        let user = await message.guild.members.fetch(userId);
        await user.roles.remove(contestant_role, "Submission deleted");
    }catch{
        return;
    }
});

client.on('messageReactionAdd', async reaction => { // todo
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching message for react count:', error);
            return;
        }
    }

    if (reaction.emoji.toString() != vote_emoji){
        return;
    }
    
    await database.upvote(reaction.message.id);
});

client.on('messageReactionRemove', async reaction => { // todo
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching message for react count:', error);
            return;
        }
    }

    if (reaction.emoji.toString() != vote_emoji){
        return;
    }
    
    await database.downvote(reaction.message.id);
});


// === Let's go :) ===
run();
