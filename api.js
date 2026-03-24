const BASE_URL = 'https://cooaguas.onrender.com';

async function consultarCliente(nuid) {
    const controller = new AbortController();
    const idTimeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(`${BASE_URL}/api/clientes/${nuid}`, {
            signal: controller.signal
        });
        
        return {
            status: response.status,
            ok: response.ok,
            data: response.ok ? await response.json() : null
        };
    } finally {
        clearTimeout(idTimeout);
    }
}

async function agendarCita(payload) {
    const controller = new AbortController();
    const idTimeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(`${BASE_URL}/api/citas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        return {
            status: response.status,
            ok: response.ok,
            data: response.ok ? await response.json() : null
        };
    } finally {
        clearTimeout(idTimeout);
    }
}

module.exports = {
    consultarCliente,
    agendarCita
};
