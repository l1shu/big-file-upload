self.importScripts('/spark-md5.min.js');

// 接受文件切片 chunkList，利用 FileReader 读取每个切片的 ArrayBuffer 并不断传入 spark-md5 中，
// 每计算完一个切片通过 postMessage 向主线程发送一个进度事件，全部完成后将最终的 hash 发送给主线程
self.onmessage = e => {
  let { chunkList } = e.data;
  let spark = new self.SparkMD5.ArrayBuffer();
  let percentage = 0;
  let count = 0;
  
  function loadNext (index) {
    let reader = new FileReader();
    reader.readAsArrayBuffer(chunkList[index].chunk);
    reader.onload = e => {
      count++;
      spark.append(e.target.result);
      if (count == chunkList.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end()
        });
      } else {
        percentage += 100 / chunkList.length;
        self.postMessage({
          percentage,
        });
        // 递归计算下一个切片
        loadNext(count);
      }
    }
  }
  loadNext(0);
}