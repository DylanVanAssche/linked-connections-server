var express = require('express');
var path = require('path');
var logger = require('morgan');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var pagefinder = require('./routes/page-finder');
var memento = require('./routes/memento');
let spdy = require('spdy');
let fs = require('fs');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(favicon(path.join('./', 'statics', 'favicon.png')))
app.use(cookieParser());

// Routes to retrieve last versions and mementos of data
app.use('/', pagefinder);
app.use('/memento', memento);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send();
  //res.render('error');
});

let options = {
    key: fs.readFileSync('../lc-data/certificate/server.key'),
    cert: fs.readFileSync('../lc-data/certificate/server.crt')
};

spdy
  .createServer(options, app)
  .listen(5000, (err) => {
    if (err) {
      throw new Error(err);
    }

    console.log('Listening on port: ' + 5000 + '.');
  });

module.exports = app;
