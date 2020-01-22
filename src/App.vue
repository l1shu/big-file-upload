<template>
  <div id="app">
    <input type="file" @change="handleFileChange" :disabled="status !== STATUS.wait">
    <el-button @click="handleUpload" :disabled="uploadDisabled">上传</el-button>
    <el-button @click="handleResume" v-if="status === STATUS.pause">恢复</el-button>
    <el-button
      v-else
      @click="handlePause"
      :disabled="status !== STATUS.uploading || !container.hash"
    >暂停</el-button>

    <div>
      <div>文件hash进度</div>
      <el-progress :percentage="hashPercentage"></el-progress>
      <div>总进度</div>
      <el-progress :percentage="totalPercentage"></el-progress>
    </div>

    <el-table :data="chunkList">
      <el-table-column prop="hash" label="切片hash" align="center"></el-table-column>
      <el-table-column label="大小（KB）" align="center" widgth="120">
        <template v-slot="{ row }">
          {{ row.size }}
        </template>
      </el-table-column>
      <el-table-column label="进度" align="center">
        <template v-slot="{ row }">
          <el-progress :percentage="row.percentage" color="#909399"></el-progress>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import http from './http';
const LENGTH = 10; // 切片数量
const STATUS = {
  wait: 'wait',
  pause: 'pause',
  uploading: 'uploading'
}

export default {
  name: 'App',
  data () {
    return {
      container: {
        file: null,
        worker: null,
        hash: ''
      },
      chunkList: [],
      hashPercentage: 0,
      requestList: [],
      STATUS,
      status: STATUS.wait
    }
  },
  computed: {
    totalPercentage () {
      if (!this.container.file || !this.chunkList.length) return 0;
      let loaded = this.chunkList
        .map(item => item.size * item.percentage)
        .reduce((acc, cur) => acc + cur);
      
      return parseInt(loaded / this.container.file.size)
    },
    uploadDisabled () {
      return !this.container.file || [STATUS.pause, STATUS.uploading].includes(this.status)
    }
  },
  methods: {
    resetData () {
      this.requestList.forEach(xhr => xhr.abort());
      this.requestList = [];
      if (this.container.worker) {
        this.container.worker.onmessage = null;
      }
    },
    handlePause () {
      this.status = STATUS.pause;
      this.resetData();
    },
    async handleResume () {
      this.status = STATUS.uploading;

      let { uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      );
      await this.uploadChunks(uploadedList);
    },
    handleFileChange (e) {
      let [ file ] = e.target.files;
      if (!file) return;
      this.resetData();
      Object.assign(this.$data, this.$options.data());
      this.container.file = file;
    },
    // 按下上传按钮的逻辑
    async handleUpload () {
      if (!this.container.file) return;
      this.status = STATUS.uploading;

      let chunkList = this.createFileChunk(this.container.file);
      this.container.hash = await this.calculateHash(chunkList);

      let { shouldUpload, uploadedList } = await this.verifyUpload(this.container.file.name, this.container.hash);
      if (!shouldUpload) {
        this.$message.success('秒传成功');
        return;
      }

      this.chunkList = chunkList.map(({ chunk }, index) => {
        return {
          chunk,
          index,
          percentage: uploadedList.includes(this.container.hash + "-" + index) ? 100 : 0,
          size: chunk.size,
          hash: this.container.hash + '-' + index,
          fileHash: this.container.hash
        }
      })
      await this.uploadChunks(uploadedList);
    },
    // 生成文件切片
    createFileChunk (file, length = LENGTH) {
      let chunkList = [];
      let chunkSize = Math.ceil(file.size / length);
      let cur = 0;
      while (cur < file.size) {
        chunkList.push({ chunk: file.slice(cur, cur + chunkSize) });
        cur += chunkSize;
      }
      return chunkList;
    },
    // 计算文件hash
    calculateHash (chunkList) {
      return new Promise(resolve => {
        this.container.worker = new Worker('/hash.js');
        this.container.worker.postMessage({ chunkList });
        this.container.worker.onmessage = e => {
          let { percentage, hash } = e.data;
          this.hashPercentage = percentage;
          if (hash) {
            resolve(hash);
          }
        }
      })
    },
    // 上传切片
    async uploadChunks (uploadedList = []) {
      let requestList = this.chunkList
      .filter(item => { // 过滤已上传的切片
        return !uploadedList.includes(item.hash)
      })
      .map(item => {
        let formData = new FormData();
        formData.append('chunk', item.chunk);
        formData.append('hash', item.hash);
        formData.append('fileHash', item.fileHash);
        formData.append('filename', this.container.file.name);
        
        return http({
          url: 'http://localhost:3000',
          data: formData,
          onProgress: this.createProgressHandler(this.chunkList[item.index]),
          requestList: this.requestList
        })
      })
      await Promise.all(requestList); // 并发切片
      
      // 已上传的切片数量 + 本次上传的切片数量 = 所有切片数量时
      // 合并切片请求
      if (uploadedList.length + requestList.length == this.chunkList.length) {
        await this.mergeRequest();
      }
    },
    async mergeRequest () {
      await http({
        url: 'http://localhost:3000/merge',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({
          filename: this.container.file.name,
          fileHash: this.container.hash
        })
      })
      this.status = STATUS.wait;
    },
    createProgressHandler (item) {
      return e => {
        item.percentage = parseInt((e.loaded / e.total) * 100);
      }
    },
    // 秒传验证
    async verifyUpload (filename, fileHash) {
      let { data } = await http({
        url: 'http://localhost:3000/verify',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({
          filename,
          fileHash
        })
      })
      return JSON.parse(data);
    }
  }
}
</script>

<style>

</style>
