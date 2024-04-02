//Require packages
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const querystring = require('querystring');
const http = require('http');
const app = express();
var mysql = require('mysql');
const fs = require('fs');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server);

// Set all dir of ejs files
app.set('views',path.join(__dirname,'views'))
app.set("view engine", "ejs");

// Set dir of all pic
app.use(express.static("public"));
app.use(express.static(path.join(__dirname,'Images')));

// for make JSON format avalible under the req.body
app.use(bodyParser.json());

// Set mySQL connection param
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Pipo.1212312121',
    database: 'greencone'
});

// Checking Connection
connection.connect(function(err) {
  if (err) throw err;
  console.log("Database Connected!");
});

//Declare list of sensors
let sensors = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];   
let sensors_name = ['humid1','humid2','humid3','temp1','temp2','temp3','oxygen1','oxygen2','ph1','ph2'];
let humid1_data = [];

// Render home.ejs
app.get("/", (req,res)=>{
    res.render('home' ,{all_sensor:sensors, sensors_name:sensors_name});
});

//Get data from ESP32
app.post('/update-sensor', (req, res) => {
    let body = '';
    
    req.on('data', (chunk) => {
        body += chunk.toString(); // convert Buffer to string
        console.log(body)

        const dataObject = querystring.parse(body); //URL query string (str) into a collection of key and value pairs

        sensors = [
            parseFloat(dataObject.humid1),
            parseFloat(dataObject.humid2),
            parseFloat(dataObject.humid3),
            parseFloat(dataObject.temp1),
            parseFloat(dataObject.temp2),
            parseFloat(dataObject.temp3),
            parseFloat(dataObject.oxygen1),
            parseFloat(dataObject.oxygen2),
            parseFloat(dataObject.ph1),
            parseFloat(dataObject.ph2)];

        const sql = 'INSERT INTO sensors (humid1, humid2, humid3, temp1, temp2, temp3, oxygen1, oxygen2, ph1, ph2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const values = sensors;
    
        //Insert data into mySQL (greencone -> sensors)
        connection.query(sql, values, (err, result) => {
            if (err) {
                console.error('Error inserting data into MySQL:', err);
                res.status(500).send('Error inserting data into MySQL');
                return;
            }
            console.log('Data inserted into MySQL successfully');
            });

        //Update sensor values via io.socket
        io.emit('sensorData', sensors);
    });

    connection.query('SELECT * FROM sensors', (err, results) => {
      if (err) {
        console.error('Error executing query: ' + err.stack);
        return res.status(500).send('Error generating CSV file');}
      const columns = Object.keys(results[0]); //Get column header names
  
      // Get data from dataset to csvData array
      results.forEach(row => {
        const values = columns.map(column => row[column]);
        humid1_data.push(values[1])
      });
  
      const newData = {
        labels: humid1_data,
        data: humid1_data};

      humid1_data = [];
      io.emit('updatedGraph', newData);
    });

    // Send a response to ESP32
    res.status(200).send('Data received successfully');
});

//When user click at download button
app.get('/download', (req, res) => {
  //Link with 'greencone' dataset and select 'sensors' table
  connection.query('SELECT * FROM sensors', (err, results) => {
    if (err) {
      console.error('Error executing query: ' + err.stack);
      return res.status(500).send('Error generating CSV file');
    }
    
    const columns = Object.keys(results[0]); //Get column header names
    const csvData = [];
    csvData.push(columns.join(',')); // Add column headers

    // Get data from dataset to csvData array
    results.forEach(row => {
      const values = columns.map(column => row[column]);
      csvData.push(values.join(','));
    });

    // Create a temporary file (that will save in host computer)
    const filePath = 'output.csv';
    fs.writeFile(filePath, csvData.join('\n'), (err) => {
      if (err) {
        console.error('Error writing CSV file: ' + err.stack);
        return res.status(500).send('Error generating CSV file');
      }

      // Set headers for file download
      res.setHeader('Content-disposition', 'attachment; filename=output.csv');
      res.setHeader('Content-type', 'text/csv');

      // Stream the file to the user
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      // Remove the temporary file after streaming (delete csv file in host computer because we can access though mySQL instead)
      fileStream.on('end', () => {
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error('Error deleting CSV file: ' + err.stack);
          }
        });
      });
    });
  });
});


// Socket.IO connection handling
io.on('connection', (socket) => {
  socket.emit('initialData', sensors);  // Send initial sensor data

  socket.on('updateGraph', (data) => {
    io.emit('updateGraph', data);
  });

});


//Http server begin
const port = 1880;
server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    // console.log(`Server listening at http://192.168.154.41:${port}`); //WIFI
    console.log(`Client listening at http://100.104.125.105:${port}`); //VPN with Tailscale
});
