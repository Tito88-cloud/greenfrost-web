const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'n8n-workflows');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

function createNode(id, name, type, position, parameters) {
    return { id, name, type, typeVersion: 1, position, parameters };
}

function createConn(source, target) {
    return { main: [ [ { node: target, type: "main", index: 0 } ] ] };
}

// Basic CORS headers for all responses
const corsHeaders = {
    headers: {
        header: [
            { name: "Access-Control-Allow-Origin", value: "*" },
            { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
            { name: "Access-Control-Allow-Headers", value: "Content-Type" }
        ]
    }
};

const workflows = [];

// 1. Register
workflows.push({
    name: "GF - Client Register",
    nodes: [
        createNode("1", "Webhook", "@n8n/n8n-nodes-base.webhook", [250, 300], { path: "gf-client-register", httpMethod: "POST", responseMode: "responseNode", options: {} }),
        createNode("2", "Check Exists", "@n8n/n8n-nodes-base.googleSheets", [450, 300], { operation: "read", sheetName: "GF_Usuarios", filtersUI: { values: [{ lookupColumn: "usuario", lookupValue: "={{$json.body.usuario}}" }] } }),
        createNode("3", "Logic", "@n8n/n8n-nodes-base.code", [650, 300], { jsCode: `
const crypto = require('crypto');
if (items.length > 0 && items[0].json.usuario) {
    return { json: { error: 'El usuario ya existe' } };
}
const body = $('Webhook').first().json.body;
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
const clienteId = uuid();
const hmacSecret = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.createHash('sha256').update(body.password).digest('hex');
return { json: { clienteId, nombre: body.nombre, usuario: body.usuario, passwordHash, telefono: body.telefono, hmacSecret, fechaRegistro: new Date().toISOString(), estado: 'activo' } };
        `}),
        createNode("4", "If", "@n8n/n8n-nodes-base.if", [850, 300], { conditions: { string: [{ value1: "={{$json.error}}", operation: "isEmpty" }] } }),
        createNode("5", "Append", "@n8n/n8n-nodes-base.googleSheets", [1050, 200], { operation: "append", sheetName: "GF_Usuarios", options: {} }),
        createNode("6", "Respond Success", "@n8n/n8n-nodes-base.respondToWebhook", [1250, 200], { respondWith: "json", responseBody: '={"success":true,"clienteId":"{{$json.clienteId}}","nombre":"{{$json.nombre}}"}', options: { responseHeaders: corsHeaders } }),
        createNode("7", "Respond Error", "@n8n/n8n-nodes-base.respondToWebhook", [1050, 400], { respondWith: "json", responseBody: '={"success":false,"error":"{{$json.error}}"}', options: { responseHeaders: corsHeaders } })
    ],
    connections: { "Webhook": createConn("Webhook", "Check Exists"), "Check Exists": createConn("Check Exists", "Logic"), "Logic": createConn("Logic", "If"), "If": { main: [ [ { node: "Append", type: "main", index: 0 } ], [ { node: "Respond Error", type: "main", index: 0 } ] ] }, "Append": createConn("Append", "Respond Success") }
});

// 2. Login
workflows.push({
    name: "GF - Client Login",
    nodes: [
        createNode("1", "Webhook", "@n8n/n8n-nodes-base.webhook", [250, 300], { path: "gf-client-login", httpMethod: "POST", responseMode: "responseNode", options: {} }),
        createNode("2", "Lookup", "@n8n/n8n-nodes-base.googleSheets", [450, 300], { operation: "read", sheetName: "GF_Usuarios", filtersUI: { values: [{ lookupColumn: "usuario", lookupValue: "={{$json.body.usuario}}" }] } }),
        createNode("3", "Validate", "@n8n/n8n-nodes-base.code", [650, 300], { jsCode: `
const crypto = require('crypto');
const req = $('Webhook').first().json.body;
if (items.length === 0 || !items[0].json.usuario) return { json: { error: 'Credenciales inválidas' } };
const user = items[0].json;
const hash = crypto.createHash('sha256').update(req.password).digest('hex');
if (hash !== user.passwordHash || user.estado !== 'activo') return { json: { error: 'Credenciales inválidas' } };
return { json: { success: true, clienteId: user.clienteId, nombre: user.nombre, hmacSecret: user.hmacSecret } };
        `}),
        createNode("4", "If", "@n8n/n8n-nodes-base.if", [850, 300], { conditions: { string: [{ value1: "={{$json.error}}", operation: "isEmpty" }] } }),
        createNode("5", "Respond Success", "@n8n/n8n-nodes-base.respondToWebhook", [1050, 200], { respondWith: "json", responseBody: '={{$json}}', options: { responseHeaders: corsHeaders } }),
        createNode("6", "Respond Error", "@n8n/n8n-nodes-base.respondToWebhook", [1050, 400], { respondWith: "json", responseBody: '={{$json}}', options: { responseHeaders: corsHeaders } })
    ],
    connections: { "Webhook": createConn("Webhook", "Lookup"), "Lookup": createConn("Lookup", "Validate"), "Validate": createConn("Validate", "If"), "If": { main: [ [ { node: "Respond Success", type: "main", index: 0 } ], [ { node: "Respond Error", type: "main", index: 0 } ] ] } }
});

// 3. Points
workflows.push({
    name: "GF - Client Points",
    nodes: [
        createNode("1", "Webhook", "@n8n/n8n-nodes-base.webhook", [250, 300], { path: "gf-client-points", httpMethod: "GET", responseMode: "responseNode", options: {} }),
        createNode("2", "Read Puntos", "@n8n/n8n-nodes-base.googleSheets", [450, 300], { operation: "read", sheetName: "GF_Puntos" }),
        createNode("3", "Read Premios", "@n8n/n8n-nodes-base.googleSheets", [450, 500], { operation: "read", sheetName: "GF_Premios" }),
        createNode("4", "Combine", "@n8n/n8n-nodes-base.code", [650, 300], { jsCode: `
const clienteId = $('Webhook').first().json.query.clienteId;
const allBranches = ['Local Rosales', 'Local Pambiles', 'Local 29', 'Local Quito'];
const puntos = {}; allBranches.forEach(b => puntos[b] = 0);
const premios = [];

const puntosRows = $('Read Puntos').all().map(i => i.json);
const premiosRows = $('Read Premios').all().map(i => i.json);

puntosRows.forEach(r => {
    if (r.clienteId === clienteId) {
        if (puntos[r.sucursal] !== undefined) puntos[r.sucursal] += parseInt(r.puntos || 0);
    }
});

premiosRows.forEach(r => {
    if (r.clienteId === clienteId) {
        premios.push(r);
    }
});
return { json: { puntos, premios } };
        `}),
        createNode("5", "Respond", "@n8n/n8n-nodes-base.respondToWebhook", [850, 300], { respondWith: "json", responseBody: '={{$json}}', options: { responseHeaders: corsHeaders } })
    ],
    connections: { "Webhook": createConn("Webhook", "Read Puntos"), "Read Puntos": createConn("Read Puntos", "Read Premios"), "Read Premios": createConn("Read Premios", "Combine"), "Combine": createConn("Combine", "Respond") }
});

// 4. Redeem
workflows.push({
    name: "GF - Client Redeem",
    nodes: [
        createNode("1", "Webhook", "@n8n/n8n-nodes-base.webhook", [250, 300], { path: "gf-client-redeem", httpMethod: "POST", responseMode: "responseNode", options: {} }),
        createNode("2", "Read Puntos", "@n8n/n8n-nodes-base.googleSheets", [450, 300], { operation: "read", sheetName: "GF_Puntos" }),
        createNode("3", "Logic", "@n8n/n8n-nodes-base.code", [650, 300], { jsCode: `
const req = $('Webhook').first().json.body;
let total = 0;
items.forEach(i => {
    if (i.json.clienteId === req.clienteId && i.json.sucursal === req.sucursal) {
        total += parseInt(i.json.puntos || 0);
    }
});
if (total < 10) return { json: { error: 'Puntos insuficientes' } };
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
return { json: { 
    error: '', 
    puntosRow: { id: uuid(), clienteId: req.clienteId, sucursal: req.sucursal, puntos: -10, tipo: 'canje', empleado: 'Sistema', fecha: new Date().toISOString() },
    premiosRow: { id: uuid(), clienteId: req.clienteId, sucursal: req.sucursal, premio: 'Helado Pequeño Gratis', estado: 'pendiente', fechaSolicitud: new Date().toISOString() }
} };
        `}),
        createNode("4", "If", "@n8n/n8n-nodes-base.if", [850, 300], { conditions: { string: [{ value1: "={{$json.error}}", operation: "isEmpty" }] } }),
        createNode("5", "Append Puntos", "@n8n/n8n-nodes-base.googleSheets", [1050, 200], { operation: "append", sheetName: "GF_Puntos", dataMode: "defineBelow", valuesUI: { values: [{ column: "id", value: "={{$json.puntosRow.id}}"}, {column: "clienteId", value: "={{$json.puntosRow.clienteId}}"}, {column: "sucursal", value: "={{$json.puntosRow.sucursal}}"}, {column: "puntos", value: "={{$json.puntosRow.puntos}}"}, {column: "tipo", value: "={{$json.puntosRow.tipo}}"}, {column: "empleado", value: "={{$json.puntosRow.empleado}}"}, {column: "fecha", value: "={{$json.puntosRow.fecha}}"}] } }),
        createNode("6", "Append Premios", "@n8n/n8n-nodes-base.googleSheets", [1250, 200], { operation: "append", sheetName: "GF_Premios", dataMode: "defineBelow", valuesUI: { values: [{ column: "id", value: "={{$json.premiosRow.id}}"}, {column: "clienteId", value: "={{$json.premiosRow.clienteId}}"}, {column: "sucursal", value: "={{$json.premiosRow.sucursal}}"}, {column: "premio", value: "={{$json.premiosRow.premio}}"}, {column: "estado", value: "={{$json.premiosRow.estado}}"}, {column: "fechaSolicitud", value: "={{$json.premiosRow.fechaSolicitud}}"}] } }),
        createNode("7", "Respond Success", "@n8n/n8n-nodes-base.respondToWebhook", [1450, 200], { respondWith: "json", responseBody: '={"success":true}', options: { responseHeaders: corsHeaders } }),
        createNode("8", "Respond Error", "@n8n/n8n-nodes-base.respondToWebhook", [1050, 400], { respondWith: "json", responseBody: '={"success":false,"error":"{{$json.error}}"}', options: { responseHeaders: corsHeaders } })
    ],
    connections: { "Webhook": createConn("Webhook", "Read Puntos"), "Read Puntos": createConn("Read Puntos", "Logic"), "Logic": createConn("Logic", "If"), "If": { main: [ [ { node: "Append Puntos", type: "main", index: 0 } ], [ { node: "Respond Error", type: "main", index: 0 } ] ] }, "Append Puntos": createConn("Append Puntos", "Append Premios"), "Append Premios": createConn("Append Premios", "Respond Success") }
});

// 5. Employee Rewards
workflows.push({
    name: "GF - Employee Rewards",
    nodes: [
        // GET pending
        createNode("1", "Webhook GET", "@n8n/n8n-nodes-base.webhook", [250, 200], { path: "gf-employee-rewards", httpMethod: "GET", responseMode: "responseNode", options: {} }),
        createNode("2", "Read Premios", "@n8n/n8n-nodes-base.googleSheets", [450, 200], { operation: "read", sheetName: "GF_Premios" }),
        createNode("3", "Read Usuarios", "@n8n/n8n-nodes-base.googleSheets", [650, 200], { operation: "read", sheetName: "GF_Usuarios" }),
        createNode("4", "Filter & Enrich", "@n8n/n8n-nodes-base.code", [850, 200], { jsCode: `
const sucursal = $('Webhook GET').first().json.query.sucursal;
const premios = $('Read Premios').all().map(i => i.json).filter(p => p.sucursal === sucursal && p.estado === 'pendiente');
const users = $('Read Usuarios').all().map(i => i.json);
premios.forEach(p => {
    const u = users.find(u => u.clienteId === p.clienteId);
    if (u) p.clienteNombre = u.nombre;
});
return { json: { premios } };
        `}),
        createNode("5", "Respond GET", "@n8n/n8n-nodes-base.respondToWebhook", [1050, 200], { respondWith: "json", responseBody: '={{$json}}', options: { responseHeaders: corsHeaders } }),
        
        // POST deliver
        createNode("6", "Webhook POST", "@n8n/n8n-nodes-base.webhook", [250, 500], { path: "gf-employee-deliver", httpMethod: "POST", responseMode: "responseNode", options: {} }),
        createNode("7", "Update Premio", "@n8n/n8n-nodes-base.googleSheets", [450, 500], { operation: "update", sheetName: "GF_Premios", dataMode: "defineBelow", filtersUI: { values: [{ lookupColumn: "id", lookupValue: "={{$json.body.premioId}}" }]}, valuesUI: { values: [{ column: "estado", value: "entregado"}, {column: "empleadoEntrega", value: "={{$json.body.empleado}}"}, {column: "fechaEntrega", value: "={{new Date().toISOString()}}"}] } }),
        createNode("8", "Respond POST", "@n8n/n8n-nodes-base.respondToWebhook", [650, 500], { respondWith: "json", responseBody: '={"success":true}', options: { responseHeaders: corsHeaders } })
    ],
    connections: { 
        "Webhook GET": createConn("Webhook GET", "Read Premios"), "Read Premios": createConn("Read Premios", "Read Usuarios"), "Read Usuarios": createConn("Read Usuarios", "Filter & Enrich"), "Filter & Enrich": createConn("Filter & Enrich", "Respond GET"),
        "Webhook POST": createConn("Webhook POST", "Update Premio"), "Update Premio": createConn("Update Premio", "Respond POST")
    }
});

const files = [
    "gf-client-register.json",
    "gf-client-login.json",
    "gf-client-points.json",
    "gf-client-redeem.json",
    "gf-employee-rewards.json"
];

workflows.forEach((wf, i) => {
    fs.writeFileSync(path.join(outDir, files[i]), JSON.stringify(wf, null, 2));
});
console.log("Workflows generated successfully.");
