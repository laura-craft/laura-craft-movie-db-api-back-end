// Express is the Node framework that we're using to make our endpoints and middleware
const express = require('express');

// bodyParser parses the JSON from incoming post and put requests
const bodyParser = require('body-parser');

// jsonwebtoken is what we use to encode and decode objects to use as authentication tokens
const jwt = require('jsonwebtoken');
// bcryt is what we use to encode and decode passwords
const bcrypt = require('bcrypt');

// cors is something else that wee need to run in our middleware
const cors = require('cors');

// The package that we use to connect to a mySQL database
const mysql = require('mysql2/promise');

// Creates an instance of Express that we use to make our API
const app = express();

// We import and immediately load the `.env` file. We need to run this before we can use `process.env`
require('dotenv').config();

//needed for port listen at the bottom
const port = process.env.PORT;

//start making connection to mysql
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// The `use` functions are the middleware - they get called before an endpoint is hit -try catch block
app.use(async function mysqlConnection(req, res, next) {
  try {
    req.db = await pool.getConnection();
    req.db.connection.config.namedPlaceholders = true;

    // Traditional mode ensures not null is respected for unsupplied fields, ensures valid JavaScript dates, etc.
    await req.db.query('SET SESSION sql_mode = "TRADITIONAL"');
    await req.db.query(`SET time_zone = '-8:00'`);

    //so it continues on
    await next();

    req.db.release();
  } catch (err) {
    // If anything downstream throw an error, we must release the connection allocated for the request
    console.log(err)
    if (req.db) req.db.release();
    throw err;
  }
});

app.use(cors());

app.use(bodyParser.json());

app.post('/register', async function (req, res) {
  try {
    let user;

    // Hashes the password and inserts the info into the `user` table
    await bcrypt.hash(req.body.password, 10).then(async hash => {
      try {
        [user] = await req.db.query(`
          INSERT INTO users (email, fname, lname, password)
          VALUES (:email, :fname, :lname, :password);
        `, {
          email: req.body.email,
          fname: req.body.fname,
          lname: req.body.lname,
          password: hash
        });

        console.log('users', user)
      } catch (error) {
        res.json('Error creating user');
        console.log('error', error)
      }
    });

    const encodedUser = jwt.sign(
      {
        userId: user.insertId,
        ...req.body
      },
      process.env.JWT_KEY
    );

    res.json({
      data: encodedUser,
      error: false,
      msg: ''
    });
  } catch (err) {
    res.json({
      data: null,
      error: true,
      msg: 'Error, please try again'
    });
    console.log('err', err)
  }
});

app.post('/log-in', async function (req, res) {
  try {
    const [[users]] = await req.db.query(`
      SELECT * FROM users WHERE email = :email
    `, {
      email: req.body.email
    });

    if (!users) {
      res.json({
        data: null,
        error: true,
        msg: 'Email not found'
      });
      return;
    }

    const userPassword = `${users.password}`

    const compare = await bcrypt.compare(req.body.password, userPassword);

    if (compare) {
      const payload = {
        userId: users.id,
        email: users.email,
        fname: users.fname,
        lname: users.lname,
        role: 4
      }

      const encodedUser = jwt.sign(payload, process.env.JWT_KEY);

      res.json({
        data: encodedUser,
        error: false,
        msg: ''
      })
    } else {
      res.json({
        data: null,
        error: true,
        msg: 'Password not found'
      });
    }
  } catch (err) {
    res.json({
      data: null,
      error: true,
      msg: 'Error logging in'
    })
    console.log('Error in /log-in', err);
  }
});

// Jwt verification checks to see if there is an authorization header with a valid jwt token in it.
app.use(async function verifyJwt(req, res, next) {
  try {
    if (!req.headers.authorization) {
      throw(401, 'Invalid authorization');
    }

    const [scheme, token] = req.headers.authorization.split(' ');

    if (scheme !== 'Bearer') {
      throw(401, 'Invalid authorization');
    }

    const payload = jwt.verify(token, process.env.JWT_KEY);

    req.user = payload;
  } catch (err) {
    if (err.message && (err.message.toUpperCase() === 'INVALID TOKEN' ||
    err.message.toUpperCase() === 'JWT EXPIRED')) {

      req.status = err.status || 500;
      req.body = err.message;
      req.app.emit('jwt-error', err, req);
    } else {
      console.log()
      throw((err.status || 500), err.message);
    }
    console.log(err);
  }

  await next();
});


// Library table
app.get("/user-library", async function (req, res) {
  try {
    const [movies] = await req.db.query(
      `SELECT * FROM user_library WHERE email = :userEmail`,
      {
        userEmail: req.user.email,
      }
    );

    return res.json({
      data: movies,
      error: false,
      msg: "Fetched movies",
    });
  } catch (err) {
    console.log("Error in /movies", err);
    res.json({
      data: null,
      error: true,
      msg: "Error fetching movies",
    });
  }
});

app.put('/save', async function(req, res) {
  try {
    await req.db.query(
      `INSERT INTO user_library (
        email,
        imdbID,
        title,
        poster
      ) VALUES (
        :email,
        :imdbID,
        :title,
        :poster
      );`,

      {
        email: req.user.email,
        imdbID: req.body.imdbID,
        title: req.body.title,
        poster: req.body.poster,
        body: req.body.body
      }
    );

    res.json('/movie save success!');

      }  catch (err) {
    console.log('Error in /save', err);
    res.json('Error sending movie');
  }
  return;
});



app.post('/user-library', async function(req, res) {
  try {
    console.log('/movie save success!')

    res.json('/user movie success!')

  } catch(err){

  }

});



app.delete('/delete-movie/:imdbID', async function(req, res) {
    try {
      await req.db.query (
        `DELETE FROM user_library WHERE imdbID = :imdbID AND email = :email`,

     {
       imdbID: req.params.imdbID,
       email: req.user.email,

      }
      );

    res.json('/deleted success!');
  } catch(err){
    console.log('Error in /delete', err);
    res.json('Error deleting movie');

  }
  });





app.listen(port, () => console.log(`movie-db-api listening at http://localhost:${port}`));
