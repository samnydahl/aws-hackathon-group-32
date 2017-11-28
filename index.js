// simple node web server that displays hello world
// optimized for Docker image

var express = require('express');
// this example uses express web framework so we know what longer build times
// do and how Dockerfile layer ordering matters. If you mess up Dockerfile ordering
// you'll see long build times on every code change + build. If done correctly,
// code changes should be only a few seconds to build locally due to build cache.

var morgan = require('morgan');
// morgan provides easy logging for express, and by default it logs to stdout
// which is a best practice in Docker. Friends don't let friends code their apps to
// do app logging to files in containers.

// Constants
const PORT = process.env.PORT || 8080;
// if you're not using docker-compose for local development, this will default to 8080
// to prevent non-root permission problems with 80. Dockerfile is set to make this 80
// because containers don't have that issue :)

// Appi
var app = express();

app.use(morgan('common'));

const fileUpload = require('express-fileupload');

app.use(fileUpload());

var ExifImage = require('exif').ExifImage;

var async = require('async');

// CORS - handler
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.post('/', function (req, res) {

  async.series([
        function(callback){
          var AWS = require('aws-sdk');

          AWS.config.update({
            region: 'us-west-2',
            credentials: new AWS.Credentials('KEY', 'SECRET')
          });

          var rekognition = new AWS.Rekognition();

          var params = {
            Image: {
              Bytes: req.files.foo.data
            },
            MaxLabels: 123,
            MinConfidence: 70
          };

          rekognition.detectLabels(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else     callback(null, data)           // successful response
          });
        },
        function(callback){
          try {
            new ExifImage({ image : req.files.foo.data }, function (error, exifData) {
                if (error)
                    console.log('Error: '+error.message);
                else
                  callback(null, exifData)
                  // callback(null, {'gps': exifData.gps})
            });
          } catch (error) {
            console.log('Error: ' + error.message);
          }
        }
    ],
    function(err, result){
        // console.log(result);
        res.send({
          labels: result[0].Labels,
          gps: result[1].gps
        })
    });
});

var server = app.listen(PORT, function () {
  console.log('Webserver is ready');
});


//
// need this in docker container to properly exit since node doesn't handle SIGINT/SIGTERM
// this also won't work on using npm start since:
// https://github.com/npm/npm/issues/4603
// https://github.com/npm/npm/pull/10868
// https://github.com/RisingStack/kubernetes-graceful-shutdown-example/blob/master/src/index.js
// if you want to use npm then start with `docker run --init` to help, but I still don't think it's
// a graceful shutdown of node process
//

// quit on ctrl-c when running docker in terminal
process.on('SIGINT', function onSigint () {
  console.info('Got SIGINT (aka ctrl-c in docker). Graceful shutdown ', new Date().toISOString());
  shutdown();
});

// quit properly on docker stop
process.on('SIGTERM', function onSigterm () {
  console.info('Got SIGTERM (docker container stop). Graceful shutdown ', new Date().toISOString());
  shutdown();
})

// shut down server
function shutdown() {
  server.close(function onServerClosed (err) {
    if (err) {
      console.error(err);
      process.exitCode = 1;
    }
    process.exit();
  })
}
//
// need above in docker container to properly exit
//

