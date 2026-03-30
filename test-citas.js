const { agendarCita } = require('./api');
const { interpretarFecha, formatearParaAPI } = require('./utils');

async function testReservarCita() {
    console.log("=== INICIANDO PRUEBA DE AGENDAMIENTO ===");
    
    // Simulamos la fecha interpretada para mañana a las 10am
    const fechaObj = interpretarFecha('mañana a las 10am');
    const fechaString = formatearParaAPI(fechaObj);

    const payload = {
        nuid: "123456",            
        telefono: "573001234567@c.us", 
        tipo: "Revisión General",  
        direccion: "Calle Falsa 123, Casa Prueba",
        fecha_hora: fechaString 
    };

    console.log("Enviando Payload:", payload);

    try {
        const response = await agendarCita(payload);
        console.log("\n=== RESPUESTA DEL SERVIDOR ===");
        console.log("Status Code:", response.status);
        if (response.data) {
           console.log("Cuerpo:", response.data);
        } else {
           console.log("Sin cuerpo JSON en la respuesta.");
        }
        
    } catch (e) {
        console.error("Error capturado:", e.message);
    }
}

testReservarCita();
