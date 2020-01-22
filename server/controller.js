const multiparty = require('multiparty');
const fse = require('fs-extra');
const path = require('path');
const UPLOAD_DIR = path.resolve(__dirname, "..", "target"); // 大文件存储目录

const resolvePost = req => {
  return new Promise((resolve) => {
    let chunk = '';
    req.on('data', data => {
      chunk += data;
    });
    req.on('end', () => {
      resolve(JSON.parse(chunk));
    })
  })
}


// 提取后缀名
function extractExt (filename) {
  return filename.slice(filename.lastIndexOf('.'), filename.length)
}

// 返回已经上传的chunk列表
async function createUploadedList (fileHash) {
  let chunkDir = `${UPLOAD_DIR}/${fileHash}`;
  return fse.existsSync(chunkDir) ? await fse.readdir(chunkDir) : []
}


module.exports = class {
  // 处理切片
  async handleFormData (req, res) {
    let multipartyForm = new multiparty.Form();

    multipartyForm.parse(req, async (err, fields, files) => {
      if (err) {
        res.status = 500;
        res.end('process file chunk failed');
        return;
      }
      let [ chunk ] = files.chunk;
      let [ hash ] = fields.hash;
      let [ filename ] = fields.filename;
      let [ fileHash ] = fields.fileHash;

      const chunkDir = `${UPLOAD_DIR}/${fileHash}`; // chunk保存的目录路径
      const filePath = `${UPLOAD_DIR}/${fileHash}${extractExt(filename)}`;

      // 文件存在直接返回
      if (fse.existsSync(filePath)) {
        res.end('file exist');
        return;
      }

      // 切片目录不存在，则创建目录
      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir);
      }

      await fse.move(chunk.path, `${chunkDir}/${hash}`);
      res.end('received file chunk');
    })
  }

  /**
   * 合并切片
   * 1. fs.writeFileSync创建空文件
   * 2. 通过 fs.appendFileSync 从切片文件夹不断将切片合并到空文件中，每次合并完成删除这个切片，最后删除文件夹
   */
  async handleMerge (req, res) {
    let data = await resolvePost(req);
    let { filename, fileHash } = data;
    let ext = extractExt(filename);
    let filePath = `${UPLOAD_DIR}/${fileHash}${ext}`;

    let chunkDir = `${UPLOAD_DIR}/${fileHash}`;
    let chunkNames = await fse.readdir(chunkDir);
    // step1
    await fse.writeFile(filePath, '');
    // step2
    chunkNames.forEach(chunkName => {
      fse.appendFileSync(filePath, fse.readFileSync(`${chunkDir}/${chunkName}`));
      fse.unlinkSync(`${chunkDir}/${chunkName}`);
    })
    fse.rmdirSync(chunkDir);

    res.end(JSON.stringify({
      code: 0,
      msg: 'merge success'
    }))
  }

  async verifyUpload (req, res) {
    let data = await resolvePost(req);
    let { filename, fileHash } = data;
    let ext = extractExt(filename);
    let filePath = `${UPLOAD_DIR}/${fileHash}${ext}`;

    // 服务端已存在该文件，不需要再次上传
    // 服务端不存在该文件或者已上传部分文件切片，通知前端进行上传，并把已上传的文件切片返回给前端
    if (fse.existsSync(filePath)) {
      res.end(JSON.stringify({
        shouldUpload: false
      }))
    } else {
      res.end(JSON.stringify({
        shouldUpload: true,
        uploadedList: await createUploadedList(fileHash)
      }))
    }
  }
}