const express = require('express');
const baliseRoute = require('./routes/balise');

const app = express();
const port = 3000;

app.use(express.json());

app.use(express.static('public'));

app.use('/balise', baliseRoute)

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`)
})