// test-api.js
const fetch = require('node-fetch');

async function check() {
    console.log("Consultando API nueva...");
    try {
        const response = await fetch("http://192.168.1.66:3000/api/clientes/36160");
        const data = await response.json();
        console.log("========== REPUESTA COMPLETA DEL API ==========");
        console.log(JSON.stringify(data, null, 2));
        console.log("===============================================");
        console.log("¿Qué llaves numéricas tiene?");
        console.log("deuda_total:", data.deuda_total);
        console.log("deuda:", data.deuda);
        console.log("saldo:", data.saldo);
        console.log("total_a_pagar:", data.total_a_pagar);
    } catch (err) {
        console.error("Error consultando API:", err);
    }
}
check();
