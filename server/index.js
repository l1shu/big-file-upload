const http = require('http');
const server = http.createServer();
const Controller = require('./controller');

const controller = new Controller();

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.status = 200;
    res.end();
    return;
  }

  if (req.url == '/') {
    await controller.handleFormData(req, res);
  }
  if (req.url == '/merge') {
    try {
      await controller.handleMerge(req, res);
    } catch (error) {
      console.log(error);
      res.end('error');
    }
  }
  if (req.url == '/verify') {
    try {
      await controller.verifyUpload(req, res);
    } catch (error) {
      res.end('error');
    }
  }
});

server.listen(3000, () => console.log('listen 3000 ...'))