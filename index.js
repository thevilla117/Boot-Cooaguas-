require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { consultarCliente, agendarCita } = require('./api');
const { interpretarFecha, formatearParaAPI, esHoraValida } = require('./utils');
const express = require('express');

// --- 1. CONFIGURACIÓN DEL SERVIDOR WEB ---
const app = express();
const port = process.env.PORT || 3005;

app.get('/', (req, res) => res.send('Bot de WhatsApp funcionando en la nube 🚀'));

// Middleware para permitir que la página web (localhost:5173) hable con el bot (localhost:3005)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// NUEVO: Endpoint para que el Web Admin mande notificaciones manuales
app.post('/api/notificar', express.json(), async (req, res) => {
    const { numero, mensaje } = req.body;
    console.log(`\n📧 Recibida orden de notificación para: ${numero}`);
    
    if (!numero || !mensaje) return res.status(400).json({ error: 'Faltan datos' });

    try {
        // Verificar si el bot está listo para enviar
        if (!client.info || !client.info.wid) {
            console.log("❌ Intento de envío fallido: El bot no ha iniciado sesión o no está 'Ready'.");
            return res.status(503).json({ error: 'El bot no ha iniciado sesión de WhatsApp todavía.' });
        }

        // Limpiar el número (quitar +, espacios, etc)
        let num = numero.replace(/\D/g, '');
        
        // Si es un número colombiano (10 dígitos) y no tiene el prefijo 57, se lo ponemos
        if (num.length === 10 && !num.startsWith('57')) {
            num = '57' + num;
            console.log(`📌 Se añadió prefijo 57 al número: ${num}`);
        }

        if (!num.includes('@c.us')) num += '@c.us';

        console.log(`📤 Intentando enviar mensaje a: ${num}`);
        console.log(`📝 Contenido: "${mensaje.substring(0, 50)}..."`);
        
        await client.sendMessage(num, mensaje);
        console.log("✅ Mensaje enviado exitosamente a WhatsApp.");
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error enviando mensaje:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => console.log(`\n🌐 Servidor de comandos del Bot escuchando en el puerto ${port}`));

// --- 2. CONFIGURACIÓN DEL BOT ---
const os = require('os');
const isLinux = os.platform() === 'linux';

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    },
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        dumpio: isLinux,
        args: isLinux 
            ? [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu', 
                '--no-zygote', 
                '--single-process',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
              ]
            : [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
              ] 
    }
});

// Memoria temporal de los usuarios
let sesiones = {};

// Estado global del bot (para !detener y !encender)
let botActivado = true;

// Chats en modo humano: el bot NO responderá en estos chats
// hasta que el asesor escriba !atendido o pasen 10 minutos
const chatsModoHumano = new Set();

// Timers de los chats en modo humano (para el auto-cierre)
const timeoutsHumanos = new Map();

const TIMEOUT_HUMANO_MS = 10 * 60 * 1000; // 10 minutos

// Filtro Anti-Spam
const controlSpam = new Map();

// Libera un chat del modo humano (usado tanto por !atendido como por timeout)
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
    console.log('\n✔ Autenticado correctamente con WhatsApp. ¡Tu teléfono ya vinculó el bot!');
    console.log('⏳ ADVERTENCIA RENDER: Descargando y sincronizando historial de chats...');
    console.log('⏳ Esto puede tardar varios minutos extra en aparecer debido a la memoria de Render.');
    console.log('⏳ Solo espera aquí sin hacer nada hasta ver el mensaje de: BOT CONECTADO Y ACTIVO.\n');
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

    // SI EL BOT ESTÁ DESACTIVADO, no responde a mensajes de otros
    if (!botActivado) {
        return;
    }

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
            "2️⃣ *Agendar cita de revisión*\n" +
            "3️⃣ *Atención al Cliente o reportar daños*\n\n" +
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
                await msg.reply("🗓️ *PROGRAMACIÓN DE CITA*\n\n👤 Por favor, indíquenos su *Nombre Completo* para registrar la visita.");
                sesiones[chat].paso = 'recibiendo_nombre_soporte';
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

        case 'recibiendo_nombre_soporte':
            sesiones[chat].nombreCita = msg.body.trim();
            await msg.reply("📍 Ahora, por favor envíanos la *dirección exacta* para la visita.");
            sesiones[chat].paso = 'recibiendo_direccion_soporte';
            break;

        case 'recibiendo_direccion_soporte':
            sesiones[chat].direccionCita = msg.body.trim();
            await msg.reply("📱 Por último, indícanos un *número de teléfono* de contacto (celular o fijo).");
            sesiones[chat].paso = 'recibiendo_telefono_soporte';
            break;

        case 'recibiendo_telefono_soporte':
            try {
                const telefonoContacto = msg.body.trim();
                const direccionOriginal = sesiones[chat].direccionCita;
                const nombre = sesiones[chat].nombreCita || 'Sin Nombre';
                
                // Unimos nombre y dirección para que el backend lo guarde junto si no tiene columna de nombre
                const direccionFinal = `${direccionOriginal} (A nombre de: ${nombre})`;

                await msg.reply("⏳ Generando solicitud... por favor espere.");

                const payload = {
                    nuid: sesiones[chat].nuid || null,
                    telefono: telefonoContacto,
                    tipo: 'Revisión General',
                    direccion: direccionFinal,
                    fecha_hora: null // La empresa asignará la fecha manualmente
                };

                const responseSoporte = await agendarCita(payload);

                if (responseSoporte.ok) {
                    const resumenCita = `✅ *SOLICITUD RECIBIDA*\n\n` +
                        `👤 *Nombre:* ${nombre}\n` +
                        `📍 *Dirección:* ${direccionOriginal}\n` +
                        `📱 *Teléfono:* ${telefonoContacto}\n\n` +
                        `¡Cooaguas recibió su petición! 💧\nSe le informará por este medio apenas su cita sea programada por uno de nuestros agentes.`;

                    await msg.reply(resumenCita + OPCIONES_NAVEGACION);
                    sesiones[chat] = { paso: 'esperando_decision' };
                } else {
                    throw new Error(`Error en API citas: HTTP ${responseSoporte.status}`);
                }

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

// --- 5. COMANDO DEL ASESOR: !atendido ---
// El asesor escribe este comando EN EL CHAT DEL CLIENTE directamente desde el WhatsApp
// para devolver el control al bot cuando termina la atención.
client.on('message_create', async (msg) => {
    // Solo nos interesan mensajes enviados por el propio WhatsApp (el asesor)
    if (!msg.fromMe) return;

    const texto = msg.body.trim().toLowerCase();
    const chat = msg.to; // El destinatario = número del cliente

    if (texto === '!atendido') {
        if (chatsModoHumano.has(chat)) {
            await liberarChat(chat, false);
        }
    }

    // COMANDOS DE CONTROL GLOBAL (Solo para el dueño)
    if (texto === '!detener') {
        botActivado = false;
        await client.sendMessage(msg.to, "🛑 *BOT DESACTIVADO*: El asistente virtual dejará de responder mensajes automáticos hasta que envíes !encender.");
        console.log("\n🛑 El bot ha sido DESACTIVADO mediante comando !detener.\n");
    }

    if (texto === '!encender') {
        botActivado = true;
        await client.sendMessage(msg.to, "✅ *BOT ACTIVADO*: El asistente virtual de Cooaguas está nuevamente en línea.");
        console.log("\n✅ El bot ha sido ACTIVADO mediante comando !encender.\n");
    }
});

client.initialize();