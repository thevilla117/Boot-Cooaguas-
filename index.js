const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { consultarCliente, agendarCita } = require('./api');

// --- 2. CONFIGURACIÓN DEL BOT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

// Memoria temporal de los usuarios
let sesiones = {};

// Chats en modo humano: el bot NO responderá en estos chats
// hasta que el asesor escriba !liberar o pasen 10 minutos
const chatsModoHumano = new Set();

// Timers de los chats en modo humano (para el auto-cierre)
const timeoutsHumanos = new Map();

const TIMEOUT_HUMANO_MS = 10 * 60 * 1000; // 10 minutos

// Filtro Anti-Spam
const controlSpam = new Map();

// Libera un chat del modo humano (usado tanto por !liberar como por timeout)
const liberarChat = async (chat, porTimeout = false) => {
    if (!chatsModoHumano.has(chat)) return;

    // Cancelar el timer pendiente si existe
    if (timeoutsHumanos.has(chat)) {
        clearTimeout(timeoutsHumanos.get(chat));
        timeoutsHumanos.delete(chat);
    }

    chatsModoHumano.delete(chat);
    delete sesiones[chat];

    if (porTimeout) {
        await client.sendMessage(chat,
            "⏱️ Nuestros asesores no pudieron atenderte en este momento.\n\n" +
            "El asistente virtual de *Cooaguas de Chochó* está nuevamente disponible. " +
            "Escribe *menú* para volver al inicio o inténtalo más tarde. 💧"
        );
        console.log(`\n⏱ Chat ${chat} liberado automáticamente (timeout 10 min).\n`);
    } else {
        await client.sendMessage(chat,
            "✅ La atención con el asesor ha finalizado.\n\n" +
            "El asistente virtual de *Cooaguas de Chochó* está nuevamente disponible. " +
            "Escribe *menú* cuando necesites ayuda. 💧"
        );
        console.log(`\n✔ Chat ${chat} liberado del modo humano.\n`);
    }
};

// Mensaje de navegación (1 = volver, 2 = finalizar)
const OPCIONES_NAVEGACION = "\n\n─────────────────────\n¿Qué deseas hacer?\n\n1️⃣ Volver al Menú Principal\n2️⃣ Finalizar";

// --- 3. EVENTOS DE INICIO DEL BOT ---
console.log('\n╔═══════════════════════════════════════╗');
console.log('║      BOT COOAGUAS DE CHOCHÓ           ║');
console.log('║      Iniciando sistema...             ║');
console.log('╚═══════════════════════════════════════╝\n');

client.on('qr', (qr) => {
    console.clear();
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   📱 ESCANEA EL QR CON WHATSAPP       ║');
    console.log('╚═══════════════════════════════════════╝\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Esperando vinculación...\n');
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Cargando WhatsApp Web: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('\n✔ Autenticado correctamente con WhatsApp.\n');
});

client.on('auth_failure', (msg) => {
    console.error('\n✘ Error de autenticación:', msg, '\n');
});

client.on('ready', () => {
    console.clear();
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║ ✅ BOT COOAGUAS CONECTADO Y ACTIVO    ║');
    console.log('║    Escuchando mensajes...             ║');
    console.log('╚═══════════════════════════════════════╝\n');
});

// --- 4. LÓGICA DEL CEREBRO ---
client.on('message', async (msg) => {
    const chat = msg.from;
    const texto = msg.body.toLowerCase().trim();

    // Filtro Anti-Spam (2 segundos)
    const lastMessageTime = controlSpam.get(chat) || 0;
    if (Date.now() - lastMessageTime < 2000) {
        return;
    }
    controlSpam.set(chat, Date.now());

    // Si este chat está siendo atendido por un asesor, el bot se queda callado
    if (chatsModoHumano.has(chat)) return;

    // Botón de pánico global — reinicia desde cualquier paso
    if (/^(menu|menú|inicio)$/i.test(texto)) {
        delete sesiones[chat];
    }

    // Helper para mostrar el menú principal
    const mostrarMenu = async () => {
        const bienvenida = "💧 *BIENVENIDO A COOAGUAS DE CHOCHÓ*\n\n" +
            "¿En qué podemos ayudarte hoy?\n\n" +
            "1️⃣ *Consultar Factura* (Saldo y fechas)\n" +
            "2️⃣ *Reportar Daño o Agendar Revisión*\n" +
            "3️⃣ *Atención al Cliente*\n\n" +
            "*(Responde con el número de la opción)*";
        await msg.reply(bienvenida);
        sesiones[chat] = { paso: 'menu_principal' };
    };

    // --- MENÚ PRINCIPAL (sin sesión activa) ---
    if (!sesiones[chat]) {
        if (/^(hola|buenas|hey|menu|menú|inicio)/i.test(texto)) {
            await mostrarMenu();
        }
        return;
    }

    const pasoActual = sesiones[chat].paso;

    switch (pasoActual) {

        // ─── MENÚ ────────────────────────────────────────────
        case 'menu_principal':
            if (texto === '1') {
                await msg.reply("🔍 Por favor, digite su *Código de Cliente*.");
                sesiones[chat].paso = 'consultando_factura';
            } else if (texto === '2') {
                await msg.reply("🛠️ *SOPORTE TÉCNICO COOAGUAS*\n\n¿Qué tipo de solicitud desea realizar?\n\n1️⃣ Reportar fuga o daño urgente\n2️⃣ Agendar revisión general\n\n*(Responda 1 o 2)*");
                sesiones[chat].paso = 'tipo_soporte';
            } else if (texto === '3') {
                // El bot se pausa: modo humano activado para este chat
                chatsModoHumano.add(chat);
                delete sesiones[chat];
                await msg.reply(
                    "📞 *ATENCIÓN AL CLIENTE*\n\n" +
                    "Hemos notificado a uno de nuestros asesores. En breve le atenderán.\n\n" +
                    "⏳ El asistente virtual quedará en pausa durante su atención."
                );
                console.log(`\n⚠ Chat ${chat} en MODO HUMANO. Asesor requerido.\n`);

                // Iniciar el temporizador de 10 minutos de auto-cierre
                const timer = setTimeout(() => liberarChat(chat, true), TIMEOUT_HUMANO_MS);
                timeoutsHumanos.set(chat, timer);
            } else {
                await msg.reply("⚠️ Opción inválida. Por favor responda con un número del *1 al 3*.");
            }
            break;

        // ─── CONSULTA DE FACTURA (Vía API REST) ────────────────
        case 'consultando_factura':
            try {
                // Usamos msg.body.trim() para preservar mayúsculas/minúsculas del código
                const codigoCliente = msg.body.trim();
                console.log(`🔍 Consultando NUID en API: "${codigoCliente}"`);

                await msg.reply("⏳ Consultando sistema...");

                // Cambiar estado a 'procesando' temporalmente para evitar peticiones duplicadas si el usuario escribe
                sesiones[chat].paso = 'procesando_factura';

                const response = await consultarCliente(codigoCliente);

                if (!response.ok) {
                    await msg.reply("❌ No encontramos ninguna cuenta asociada al código ingresado. Verifique e intente nuevamente." + OPCIONES_NAVEGACION);
                } else {
                    const datos = response.data;
                    
                    const totalDeuda = parseFloat(datos.deuda_total || 0);

                    // Si la deuda es 0 o el estado es explícitamente 'Pagada'
                    if (totalDeuda === 0 || datos.estado === 'Pagada') {
                        const barrioLinea = datos.barrio ? `\n🏘️ *Barrio:* ${datos.barrio}` : '';
                        const mensajeVacio = `✅ Hola *${datos.nombre_completo}*${barrioLinea}\n\nSu cuenta se encuentra al día. No presenta saldos pendientes.\n\n💰 *Saldo a pagar:* $0 COP`;
                        await msg.reply(mensajeVacio + OPCIONES_NAVEGACION);
                    } else {
                        // Formatear fechas asumiendo que vienen de la API en formato ISO o similar
                        const fechaOportuno = datos.fecha_pago_oportuno
                            ? new Date(datos.fecha_pago_oportuno).toLocaleDateString('es-CO')
                            : 'N/A';
                        const fechaSuspension = datos.fecha_suspension
                            ? new Date(datos.fecha_suspension).toLocaleDateString('es-CO')
                            : 'N/A';

                        const barrioLinea = datos.barrio ? `🏘️ *Barrio:* ${datos.barrio}\n` : '';

                        const mensaje = `📄 *RESUMEN DE ESTADO DE CUENTA*\n\n` +
                            `👤 *Titular:* ${datos.nombre_completo}\n` +
                            `🔢 *Código:* ${codigoCliente}\n` +
                            `📍 *Dirección:* ${datos.direccion}\n` +
                            barrioLinea + `\n` +
                            `📋 *Facturas Vencidas:* ${datos.facturas_vencidas || 'N/A'}\n` +
                            `💰 *Total a Pagar:* $${totalDeuda.toLocaleString('es-CO')} COP\n` +
                            `🗓️ *Pago Oportuno:* ${fechaOportuno}\n` +
                            `✂️ *Fecha de Suspensión:* ${fechaSuspension}\n\n` +
                            `*Cooaguas de Chochó* 💧` +
                            OPCIONES_NAVEGACION;

                        await msg.reply(mensaje);
                    }
                }
            } catch (error) {
                console.error("❌ Error consumiendo API:", error.message);
                await msg.reply("⚠️ En este momento nuestro sistema de consultas está en mantenimiento o sin conexión al servidor. Intente más tarde." + OPCIONES_NAVEGACION);
            }
            sesiones[chat] = { paso: 'esperando_decision' };
            break;

        case 'procesando_factura':
            // Ignorar mensajes adicionales mientras se procesa la consulta para no generar spam ni cuelgues
            console.log(`⏳ Ignorando mensaje de ${chat} porque se está procesando su factura...`);
            break;

        // ─── TIPO DE SOPORTE ─────────────────────────────────
        case 'tipo_soporte':
            if (texto === '1') {
                sesiones[chat].tipo = 'Urgencia';
                await msg.reply("📍 Indíquenos la *dirección exacta* de la fuga o daño.");
                sesiones[chat].paso = 'recibiendo_direccion_soporte';
            } else if (texto === '2') {
                sesiones[chat].tipo = 'Revisión';
                await msg.reply("🗓️ ¿Para qué *fecha y hora* le gustaría agendar la revisión?");
                sesiones[chat].paso = 'recibiendo_fecha_revision';
            } else {
                await msg.reply("⚠️ Opción inválida. Responda *1* para Urgencia o *2* para Revisión.");
            }
            break;

        case 'recibiendo_fecha_revision':
            const regexFecha = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/202[6-9] ([01][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!regexFecha.test(msg.body.trim())) {
                await msg.reply('⚠️ El formato de la fecha es incorrecto.\n\nPor favor, escríbalo exactamente así: DD/MM/AAAA HH:MM\n(Ejemplo: 25/03/2026 10:00)');
                return;
            }
            sesiones[chat].fechaAgendada = msg.body.trim();
            await msg.reply("📍 Por favor envíenos la *dirección exacta* donde se realizará la revisión.");
            sesiones[chat].paso = 'recibiendo_direccion_soporte';
            break;

        case 'recibiendo_direccion_soporte':
            try {
                const direccion = msg.body.trim();
                
                await msg.reply("⏳ Consultando sistema...");

                const tipoSoporte = sesiones[chat].tipo;
                const fechaHora = sesiones[chat].fechaAgendada || undefined;
                
                const payload = {
                    nuid: sesiones[chat].nuid || null,
                    telefono: msg.from,
                    tipo: tipoSoporte,
                    direccion: direccion,
                    fecha_hora: fechaHora
                };

                const responseSoporte = await agendarCita(payload);

                if (responseSoporte.status === 409) {
                    await msg.reply('⚠️ Ese horario ya está reservado. Por favor, intenta con otro momento.');
                    if (tipoSoporte === 'Revisión') {
                        await msg.reply("🗓️ ¿Para qué *fecha y hora* le gustaría agendar la revisión?");
                        sesiones[chat].paso = 'recibiendo_fecha_revision';
                    } else {
                        await msg.reply("📍 Indíquenos la *dirección exacta* de la fuga o daño.");
                        sesiones[chat].paso = 'recibiendo_direccion_soporte';
                    }
                    return;
                }

                if (!responseSoporte.ok) {
                    throw new Error(`Error en API citas: HTTP ${responseSoporte.status}`);
                }

                const resumenCita = tipoSoporte === 'Urgencia'
                    ? `🚨 *REPORTE DE EMERGENCIA RECIBIDO*\n\nHemos notificado a nuestros técnicos. Se dirigirán al lugar a la brevedad posible.`
                    : `✅ *REVISIÓN AGENDADA*\n\nSu cita quedó registrada para el: *${fechaHora}*.\nNuestros técnicos visitarán su domicilio en ese horario.`;

                await msg.reply(resumenCita + OPCIONES_NAVEGACION);
                sesiones[chat] = { paso: 'esperando_decision' };

            } catch (error) {
                console.error("❌ Error consumiendo API citas:", error.message);
                await msg.reply("⚠️ En este momento nuestro sistema de soporte está en mantenimiento o sin conexión. Intente más tarde." + OPCIONES_NAVEGACION);
                sesiones[chat] = { paso: 'esperando_decision' };
            }
            break;

        // ─── DECISIÓN POST-RESPUESTA ─────────────────────────
        case 'esperando_decision':
            if (texto === '1') {
                await mostrarMenu();
            } else if (texto === '2') {
                await msg.reply('👋 Hasta luego. Si necesita ayuda nuevamente, escríbanos. ¡Que tenga un excelente día! 💧');
                delete sesiones[chat];
            } else {
                await msg.reply('Por favor responde *1* para volver al menú o *2* para finalizar.');
            }
            break;
    }
});

// --- 5. COMANDO DEL ASESOR: !liberar ---
// El asesor escribe este comando EN EL CHAT DEL CLIENTE directamente desde el WhatsApp
// para devolver el control al bot cuando termina la atención.
client.on('message_create', async (msg) => {
    // Solo nos interesan mensajes enviados por el propio WhatsApp (el asesor)
    if (!msg.fromMe) return;

    const texto = msg.body.trim().toLowerCase();
    const chat = msg.to; // El destinatario = número del cliente

    if (texto === '!liberar') {
        if (chatsModoHumano.has(chat)) {
            await liberarChat(chat, false);
        }
    }
});

client.initialize();