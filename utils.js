const { DateTime } = require('luxon');

/**
 * Interpreta una fecha y hora desde un texto en español.
 * Soporta: "hoy", "mañana", "lunes", "26/03", "26/03/2026", "a las 10", "3pm", etc.
 */
function interpretarFecha(texto) {
    const ahora = DateTime.now().setZone('America/Bogota');
    let fecha = ahora;
    let textoLimpio = texto.toLowerCase().trim();

    // 1. Determinar el Día
    if (textoLimpio.includes('hoy')) {
        fecha = ahora;
    } else if (textoLimpio.includes('mañana')) {
        fecha = ahora.plus({ days: 1 });
    } else {
        // Buscar formatos DD/MM/YYYY o DD/MM
        const matchFecha = textoLimpio.match(/(\d{1,2})\/(\d{1,2})(\/(\d{4}))?/);
        if (matchFecha) {
            const dia = parseInt(matchFecha[1]);
            const mes = parseInt(matchFecha[2]);
            const año = matchFecha[4] ? parseInt(matchFecha[4]) : ahora.year;
            fecha = DateTime.fromObject({ day: dia, month: mes, year: año }, { zone: 'America/Bogota' });
        } else {
            // Buscar días de la semana
            const diasSemana = {
                'lunes': 1, 'martes': 2, 'miercoles': 3, 'miércoles': 3,
                'jueves': 4, 'viernes': 5, 'sabado': 6, 'sábado': 6, 'domingo': 7
            };
            for (const [nombre, valor] of Object.entries(diasSemana)) {
                if (textoLimpio.includes(nombre)) {
                    let diff = valor - ahora.weekday;
                    if (diff <= 0) diff += 7;
                    fecha = ahora.plus({ days: diff });
                    break;
                }
            }
        }
    }

    // 2. Determinar la Hora
    let hora = 10; // Default
    let minuto = 0;

    // Buscar formatos HH:MM (am/pm) o "a las HH"
    const matchHora = textoLimpio.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)?/);
    if (matchHora) {
        hora = parseInt(matchHora[1]);
        minuto = matchHora[3] ? parseInt(matchHora[3]) : 0;
        const ampm = matchHora[4];

        if (ampm === 'pm' && hora < 12) hora += 12;
        if (ampm === 'am' && hora === 12) hora = 0;
    } else {
        // Buscar "a las X"
        const matchALas = textoLimpio.match(/a las (\d{1,2})/);
        if (matchALas) {
            hora = parseInt(matchALas[1]);
        }
    }

    fecha = fecha.set({ hour: hora, minute: minuto, second: 0, millisecond: 0 });

    if (!fecha.isValid) return null;
    
    // Si la fecha es pasada (e.g. "a las 8" y ya son las 9), mover al futuro si es razonable
    if (fecha < ahora && textoLimpio.includes('a las') && !textoLimpio.includes('hoy') && !textoLimpio.includes('mañana')) {
        // Si no especificó día, asumimos hoy o mañana
        if (fecha.plus({ days: 1 }) > ahora) {
             fecha = fecha.plus({ days: 1 });
        }
    }

    return fecha;
}

/**
 * Formatea una fecha para enviar al API (DD/MM/YYYY HH:mm)
 */
function formatearParaAPI(fecha) {
    return fecha.toFormat('dd/MM/yyyy HH:mm');
}

/**
 * Verifica si la hora está en el rango permitido (7am - 5pm)
 */
function esHoraValida(fecha) {
    const h = fecha.hour;
    return h >= 7 && h < 17;
}

module.exports = {
    interpretarFecha,
    formatearParaAPI,
    esHoraValida
};
