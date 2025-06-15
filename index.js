require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events } = require('discord.js');
const fs = require('fs');

// ✅ IDs dos Canais
const canalPonto = '1380998543254356089';
const canalLogs = '1380998559335448637';
const canalConsulta = '1380998324265418872';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

let database = {
    ativos: [],
    encerrados: []
};

if (fs.existsSync('database.json')) {
    database = JSON.parse(fs.readFileSync('database.json'));
}

function salvarDB() {
    fs.writeFileSync('database.json', JSON.stringify(database, null, 2));
}

// 🔧 Funções Utilitárias

function formatarHora(ms) {
    const data = new Date(ms);
    return `${data.getHours().toString().padStart(2, '0')}:${data.getMinutes().toString().padStart(2, '0')}`;
}

function formatarDuracao(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h} hora${h !== 1 ? 's' : ''} ${m} minuto${m !== 1 ? 's' : ''}`;
}

function pegarNumero(nome) {
    const match = nome.match(/^(\d+)\s*-/);
    return match ? match[1] : null;
}

// 🔗 Embeds

function criarEmbedBotoes() {
    return new EmbedBuilder()
        .setColor('#dd0404')
        .setTitle('📅 Sistema de Ponto')
        .setDescription(
            '> 🔰 **Bem-vindo ao Sistema de Ponto da Organização!**\n' +
            '> Clique nos botões abaixo para **INICIAR** ou **ENCERRAR** seu ponto.'
        )
        .setFooter({ text: 'Sistema de Ponto' })
        .setTimestamp();
}

function criarEmbedPontos() {
    const ativos = database.ativos.map((p, i) => {
        const tempo = formatarDuracao(Date.now() - p.inicio);
        return `[${(i + 1).toString().padStart(2, '0')}] [${formatarHora(p.inicio)}] ${p.numero} - ${p.nome} • (${tempo})`;
    }).join('\n') || '❌ Ninguém em serviço no momento.';

    const encerrados = database.encerrados.slice(-10).reverse().map((p, i) => {
        return `[${(i + 1).toString().padStart(2, '0')}] [${formatarHora(p.inicio)}] ${p.numero} - ${p.nome} • ${formatarDuracao(p.fim - p.inicio)}`;
    }).join('\n') || '❌ Nenhum ponto encerrado.';

    return new EmbedBuilder()
        .setColor('#dd0404')
        .setTitle('📋 Histórico de Pontos')
        .setDescription(
            `> 👮‍♂️ **Oficiais em Serviço:**\n${ativos}\n\n` +
            `> 📜 **Últimos Pontos Encerrados:**\n${encerrados}`
        )
        .setFooter({ text: 'Sistema de Ponto' })
        .setTimestamp();
}

function criarEmbedLogs(acao, membro, inicio, fim = null) {
    const numero = pegarNumero(membro.displayName) || 'N/A';
    const tempo = fim ? formatarDuracao(fim - inicio) : formatarDuracao(Date.now() - inicio);

    const embed = new EmbedBuilder()
        .setColor(acao === 'iniciou' ? '#04dd04' : '#dd0404')
        .setTitle(`📑 Log de Ponto — ${acao === 'iniciou' ? 'Entrada' : 'Saída'}`)
        .setThumbnail(membro.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Usuário', value: `${membro.displayName}`, inline: true },
            { name: '🆔 ID', value: membro.id, inline: true },
            { name: '🔢 Passaporte', value: numero, inline: true },
            { name: '⏰ Horário', value: formatarHora(inicio), inline: true },
            { name: acao === 'iniciou' ? '🟢 Status' : '🔴 Tempo Trabalhado', value: acao === 'iniciou' ? 'Em serviço' : tempo, inline: true }
        )
        .setFooter({ text: `Sistema de Ponto • ${acao === 'iniciou' ? 'Ponto Iniciado' : 'Ponto Encerrado'}` })
        .setTimestamp();

    return embed;
}

// 🔥 Sistema de Ponto

client.once('ready', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);

    // Envia mensagem fixa com botões e histórico no canal de ponto
    const canal = await client.channels.fetch(canalPonto);

    // Limpa mensagens antigas (100 últimas)
    const msgs = await canal.messages.fetch({ limit: 100 });
    await Promise.all(msgs.map(m => m.delete().catch(() => {})));

    // Botões
    const botaoIniciar = new ButtonBuilder()
        .setCustomId('iniciar')
        .setLabel('Iniciar Ponto')
        .setStyle(ButtonStyle.Success);

    const botaoEncerrar = new ButtonBuilder()
        .setCustomId('encerrar')
        .setLabel('Encerrar Ponto')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(botaoIniciar, botaoEncerrar);

    await canal.send({ embeds: [criarEmbedBotoes()], components: [row] });
    await canal.send({ embeds: [criarEmbedPontos()] });

    // Envia mensagem fixa no canal de consulta com instruções
    const canalCons = await client.channels.fetch(canalConsulta);
    const embedConsulta = new EmbedBuilder()
        .setColor('#dd0404')
        .setTitle('🔍 Consulta de Pontos')
        .setDescription(
            '> 📑 **Como funciona a consulta:**\n\n' +
            '> Digite o número que está **antes do hífen no seu nome do Discord.**\n' +
            '> ➕ Exemplo: Se seu nome for `137 - Petro K. Montserrat`, digite `137`.\n\n' +
            '> O sistema irá retornar seu histórico de pontos!\n' +
            '> 🔔 As consultas duram **5 minutos** e serão apagadas automaticamente.\n\n' +
            '> ❗ **Dúvidas? Procure um superior.**'
        )
        .setFooter({ text: 'Sistema de Ponto' })
        .setTimestamp();

    await canalCons.send({ embeds: [embedConsulta] });
});

// 🎯 Botões de Interação

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const membro = await interaction.guild.members.fetch(interaction.user.id);
    const nome = membro.displayName;
    const numero = pegarNumero(nome);

    if (!numero) {
        return interaction.reply({ content: '❌ Seu nome precisa estar no formato `123 - Nome`!', ephemeral: true });
    }

    const log = await client.channels.fetch(canalLogs);
    const canal = await client.channels.fetch(canalPonto);

    if (interaction.customId === 'iniciar') {
        if (database.ativos.find(p => p.id === membro.id)) {
            return interaction.reply({ content: '❌ Você já está em serviço.', ephemeral: true });
        }

        const ponto = { id: membro.id, nome, numero, inicio: Date.now() };
        database.ativos.push(ponto);
        salvarDB();

        await log.send({ embeds: [criarEmbedLogs('iniciou', membro, ponto.inicio)] });

        // Atualiza mensagens no canal de ponto
        const msgs = await canal.messages.fetch({ limit: 100 });
        await Promise.all(msgs.map(m => m.delete().catch(() => {})));

        // Botões e histórico atualizados
        const botaoIniciar = new ButtonBuilder()
            .setCustomId('iniciar')
            .setLabel('Iniciar Ponto')
            .setStyle(ButtonStyle.Success);

        const botaoEncerrar = new ButtonBuilder()
            .setCustomId('encerrar')
            .setLabel('Encerrar Ponto')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(botaoIniciar, botaoEncerrar);

        await canal.send({ embeds: [criarEmbedBotoes()], components: [row] });
        await canal.send({ embeds: [criarEmbedPontos()] });

        return interaction.reply({ content: '✅ Ponto iniciado com sucesso!', ephemeral: true });
    }

    if (interaction.customId === 'encerrar') {
        const index = database.ativos.findIndex(p => p.id === membro.id);
        if (index === -1) {
            return interaction.reply({ content: '❌ Você não está em serviço.', ephemeral: true });
        }

        const ponto = database.ativos.splice(index, 1)[0];
        ponto.fim = Date.now();
        database.encerrados.push(ponto);
        salvarDB();

        await log.send({ embeds: [criarEmbedLogs('encerrou', membro, ponto.inicio, ponto.fim)] });

        // Atualiza mensagens no canal de ponto
        const msgs = await canal.messages.fetch({ limit: 100 });
        await Promise.all(msgs.map(m => m.delete().catch(() => {})));

        // Botões e histórico atualizados
        const botaoIniciar = new ButtonBuilder()
            .setCustomId('iniciar')
            .setLabel('Iniciar Ponto')
            .setStyle(ButtonStyle.Success);

        const botaoEncerrar = new ButtonBuilder()
            .setCustomId('encerrar')
            .setLabel('Encerrar Ponto')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(botaoIniciar, botaoEncerrar);

        await canal.send({ embeds: [criarEmbedBotoes()], components: [row] });
        await canal.send({ embeds: [criarEmbedPontos()] });

        return interaction.reply({ content: '✅ Ponto encerrado com sucesso!', ephemeral: true });
    }
});

// 🔎 Consulta

client.on('messageCreate', async message => {
    if (message.channel.id !== canalConsulta) return;
    if (message.author.bot) return;

    const numero = message.content.trim();

    // Busca registros encerrados e ponto ativo
    const registros = database.encerrados.filter(p => p.numero === numero);
    const ativo = database.ativos.find(p => p.numero === numero);

    // Encontra membro pelo número no displayName
    const membro = message.guild.members.cache.find(m => pegarNumero(m.displayName) === numero);

    // Soma total de tempo de pontos encerrados
    const tempoTotalEncerrados = registros.reduce((acc, p) => acc + (p.fim - p.inicio), 0);
    // Tempo ativo (se houver ponto aberto)
    const tempoAtivo = ativo ? (Date.now() - ativo.inicio) : 0;
    const tempoGeral = tempoTotalEncerrados + tempoAtivo;

    const embed = new EmbedBuilder()
        .setColor('#dd0404')
        .setTitle('📋 Consulta de Pontos')
        .setThumbnail(membro ? membro.user.displayAvatarURL({ dynamic: true }) : null)
        .setDescription(
            membro ? `> 👤 **${membro.displayName}**\n> 🆔 **${membro.id}**\n\n` : ''
        )
        .addFields(
            {
                name: '📜 Histórico:',
                value: registros.length
                    ? registros.slice(-20).reverse().map((p, i) => {
                        return `[${(i + 1).toString().padStart(2, '0')}] [${formatarHora(p.inicio)}] ${p.numero} - ${p.nome} • ${formatarDuracao(p.fim - p.inicio)}`;
                    }).join('\n')
                    : '❌ Nenhum ponto encontrado.'
            },
            {
                name: '🟢 Ponto Ativo:',
                value: ativo
                    ? `Em serviço desde **${formatarHora(ativo.inicio)}** • (${formatarDuracao(tempoAtivo)})`
                    : '❌ Nenhum ponto ativo.'
            },
            {
                name: '⏳ Tempo Total Registrado:',
                value: tempoGeral > 0
                    ? `**${formatarDuracao(tempoGeral)}** somados em todos os pontos.`
                    : '❌ Nenhum tempo registrado.'
            }
        )
        .setFooter({ text: 'Sistema de Ponto' })
        .setTimestamp();

    const msg = await message.channel.send({ embeds: [embed] });

    setTimeout(() => {
        msg.delete().catch(() => {});
        message.delete().catch(() => {});
    }, 300000); // 5 minutos
});

// 🔧 Sistema de Ticket - Corregedoria
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const canalTicket = '1380998290899865690';
const categoriaTicket = '1383777816109256845';
const canalLogsTicket = '1380998487415455864';
const cargosAutorizados = [
    '1380998072628281414',
    '1380998057562341477',
    '1380998061429624922',
    '1380998210885124167'
];

client.on('ready', async () => {
    const canal = await client.channels.fetch(canalTicket);

    const botaoAbrir = new ButtonBuilder()
        .setCustomId('abrir_ticket')
        .setLabel('📨 Abrir Ticket - Corregedoria')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(botaoAbrir);

    const embed = new EmbedBuilder()
        .setTitle('🛡️ Atendimento Corregedoria')
        .setDescription('Clique no botão abaixo para abrir um ticket privado com a corregedoria.')
        .setColor('#dd0404');

    await canal.send({ embeds: [embed], components: [row] });
});

// Abrindo Ticket
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'abrir_ticket') {
        const nomeCanal = `corregedoria-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, '');

        const canalExistente = interaction.guild.channels.cache.find(c => c.name === nomeCanal);
        if (canalExistente) {
            return interaction.reply({ content: '❌ Você já possui um ticket aberto.', ephemeral: true });
        }

        const canal = await interaction.guild.channels.create({
            name: nomeCanal,
            type: ChannelType.GuildText,
            parent: categoriaTicket,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                ...cargosAutorizados.map(cargoId => ({
                    id: cargoId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }))
            ]
        });

        const botaoFechar = new ButtonBuilder()
            .setCustomId('fechar_ticket')
            .setLabel('🔒 Fechar')
            .setStyle(ButtonStyle.Secondary);

        const botaoNotificar = new ButtonBuilder()
            .setCustomId('notificar_ticket')
            .setLabel('📢 Notificar')
            .setStyle(ButtonStyle.Primary);

        const botaoAdd = new ButtonBuilder()
            .setCustomId('adicionar_ticket')
            .setLabel('➕ Adicionar Pessoa')
            .setStyle(ButtonStyle.Success);

        const botaoRemove = new ButtonBuilder()
            .setCustomId('remover_ticket')
            .setLabel('➖ Remover Pessoa')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(botaoFechar, botaoNotificar, botaoAdd, botaoRemove);

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Ticket - Corregedoria')
            .setDescription(`Ticket aberto por <@${interaction.user.id}>.\nAguarde atendimento.`)
            .setColor('#dd0404');

        await canal.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });

        await interaction.reply({ content: `✅ Ticket criado: ${canal}`, ephemeral: true });

        const logs = await client.channels.fetch(canalLogsTicket);
        logs.send(`📨 Ticket aberto: ${canal} por <@${interaction.user.id}>`);
    }
});

// Botões dentro do Ticket
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const canal = interaction.channel;

    if (interaction.customId === 'fechar_ticket') {
        if (!cargosAutorizados.some(id => interaction.member.roles.cache.has(id)) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Você não tem permissão para fechar este ticket.', ephemeral: true });
        }

        await canal.delete();

        const logs = await client.channels.fetch(canalLogsTicket);
        logs.send(`🔒 Ticket fechado: ${canal.name} por <@${interaction.user.id}>`);
    }

    if (interaction.customId === 'notificar_ticket') {
        const dono = canal.topic;
        if (!dono) return interaction.reply({ content: '❌ Não foi possível identificar o dono do ticket.', ephemeral: true });

        try {
            const user = await client.users.fetch(dono);
            await user.send(`📢 Um membro da corregedoria enviou uma notificação no seu ticket (${canal.name}). Verifique o servidor.`);

            await interaction.reply({ content: '✅ Notificação enviada no privado.', ephemeral: true });
        } catch {
            await interaction.reply({ content: '❌ Não consegui enviar DM para o usuário.', ephemeral: true });
        }
    }

    if (interaction.customId === 'adicionar_ticket') {
        const modal = {
            title: 'Adicionar Pessoa',
            custom_id: 'add_user_modal',
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'id_usuario',
                            label: 'ID do usuário para adicionar',
                            style: 1,
                            min_length: 17,
                            max_length: 20,
                            required: true
                        }
                    ]
                }
            ]
        };
        await interaction.showModal(modal);
    }

    if (interaction.customId === 'remover_ticket') {
        const modal = {
            title: 'Remover Pessoa',
            custom_id: 'remove_user_modal',
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'id_usuario',
                            label: 'ID do usuário para remover',
                            style: 1,
                            min_length: 17,
                            max_length: 20,
                            required: true
                        }
                    ]
                }
            ]
        };
        await interaction.showModal(modal);
    }
});

// Modal de adicionar/remover
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;

    const canal = interaction.channel;
    const idUsuario = interaction.fields.getTextInputValue('id_usuario');

    try {
        const membro = await interaction.guild.members.fetch(idUsuario);

        if (interaction.customId === 'add_user_modal') {
            await canal.permissionOverwrites.create(membro, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
            await interaction.reply({ content: `✅ <@${idUsuario}> adicionado ao ticket.`, ephemeral: true });
        }

        if (interaction.customId === 'remove_user_modal') {
            await canal.permissionOverwrites.delete(membro);
            await interaction.reply({ content: `✅ <@${idUsuario}> removido do ticket.`, ephemeral: true });
        }
    } catch {
        await interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
