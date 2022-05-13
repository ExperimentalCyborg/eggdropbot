const { Client, Intents, Permissions } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, guildId, token, unsplash_key, submission_channel, eggspell_role, contestant_role } = require('./config.json');

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });


// === CORE ===

function deploy_commands(){
	const ban_permission_flag = Permissions.FLAGS.KICK_MEMBERS.toString();
	let commands = [];

	// public commands
	commands.push(new SlashCommandBuilder().setName('submit').setDescription("Submit your egg drop challenge entry.")
		.addStringOption(option => option.setName('url').setDescription("Link to your submission video").setRequired(true)).toJSON());
	commands.push(new SlashCommandBuilder().setName('egg').setDescription("A nice egg in this trying time.").toJSON());
	commands.push(new SlashCommandBuilder().setName('ping').setDescription("Check if i'm still alive and healthy.").toJSON());

	// privileged commands
	cmd = new SlashCommandBuilder().setName('eggspell').setDescription("Ban a user from submitting entries.")
				.addUserOption(option => option.setName('target').setDescription("The user to eggspell").setRequired(true))
	cmd.defaultPermission = false;
	cmd = cmd.toJSON();
	cmd.default_member_permissions = ban_permission_flag;

	commands.push(cmd);

	cmd = new SlashCommandBuilder().setName('eggscuse').setDescription("Lift a submission ban.")
				.addUserOption(option => option.setName('target').setDescription("The user to eggscuse").setRequired(true))
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
							.setDescription("Delete all recorded submissions. Requires confirmation."))
	cmd.defaultPermission = false;
	cmd = cmd.toJSON();
	cmd.default_member_permissions = ban_permission_flag;
	commands.push(cmd);
						
	// register them
	const rest = new REST({ version: '9' }).setToken(token);
	rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
		.then(() => console.log('Successfully registered application commands.'))
		.catch(console.error);
}

function run(){
	console.log('Starting')
	process.on('SIGINT', exit);
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


// == INTERACTIONS ===

async function cmd_ping(interaction){
	let delay = Date.now() - interaction.createdTimestamp;
	await interaction.reply({'content': `Pong! ⏱️\`${delay}\``, 'ephemeral': true});
}

async function cmd_egg(interaction){
	unsplash_request = `https://api.unsplash.com/photos/random?query=egg&client_id=${unsplash_key}`;
	fetch(unsplash_request)
    	.then(result => result.json())
    	.then(async (reply) => {
			await interaction.reply({'content': reply.urls.regular, 'ephemeral': interaction.channelId == submission_channel});
		}).catch(async (error)=>{ 
			await interaction.reply({'content': `Failed to fetch you a fresh egg: ${error}`, 'ephemeral': true});
			console.error(`Failed to deliver egg: ${error}`);
		})
}

async function cmd_submit(interaction){
	await interaction.reply({'content': "cmd_submit", 'ephemeral': true});
}

async function cmd_eggspell(interaction){
	await interaction.reply({'content': "cmd_eggspell", 'ephemeral': true});
}

async function cmd_eggscuse(interaction){
	await interaction.reply({'content': "cmd_eggscuse", 'ephemeral': true});
}

async function cmd_submissions_open(interaction){
	await interaction.reply({'content': "cmd_submissions_open", 'ephemeral': true});
}

async function cmd_submissions_close(interaction){
	await interaction.reply({'content': "cmd_submissions_close", 'ephemeral': true});
}

async function cmd_submissions_clear(interaction){
	await interaction.showModal()
	await interaction.reply({'content': "cmd_submissions_clear", 'ephemeral': true});
}

async function cmd_submissions_download(interaction){
	await interaction.reply({'content': "cmd_submissions_download", 'ephemeral': true});
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
				interaction.reply({'content': "This command is not implemented (yet).", ephemeral: true});
		}
	}catch (reason) {
		console.error(`Interaction command crashed: ${reason}`);
	}
	
});


// === Let's go :) ===
run();
