export default function ({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e,
  requestList
}) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = onProgress;
    xhr.open(method, url);
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key])
    });
    xhr.send(data);

    // 暴露当前 xhr 给外部
    if (requestList) {
      requestList.push(xhr);
    }

    xhr.onload = e => {
      // 将请求成功的 xhr 从列表中删除
      if (requestList) {
        let xhrIdx = requestList.find(item => item === xhr);
        requestList.splice(xhrIdx, 1);
      }
      
      resolve({
        data: e.target.response
      })
    }
  })
}