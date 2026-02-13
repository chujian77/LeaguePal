<template>
    <div class="ace">
        <h3>反作弊系统 (ACE) 设置</h3>
        <p class="desc">
            选择游戏目录下的 ACE 路径，客户端启动时将自动预启动该路径的 SGuard64.exe，避免系统默认的 ACE 扫描硬盘导致游戏掉帧。
        </p>
        <p class="hint">
            路径示例：F:\wegame\英雄联盟(26)\Game\AntiCheatExpert\SGuard\x64
        </p>

        <div class="path-row">
            <input type="text" v-model="acePath" placeholder="请选择或输入 SGuard64.exe 所在目录" @change="handleManualInput" />
            <button @click="handleSelectPath">选择路径</button>
            <button @click="handleSavePath" class="save-btn">保存</button>
        </div>

        <div class="status" v-if="statusMsg">
            <span :class="{ success: isSuccess, error: !isSuccess }">{{ statusMsg }}</span>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, onMounted } from 'vue';

const acePath = ref<string>('');
const statusMsg = ref<string>('');
const isSuccess = ref<boolean>(true);

// 加载已保存的路径
onMounted(async () => {
    try {
        const savedPath = await window.ace.getPath();
        if (savedPath) {
            acePath.value = savedPath;
        }
    } catch (error) {
        console.error('加载 ACE 路径失败:', error);
    }
});

// 打开文件夹选择对话框
async function handleSelectPath() {
    try {
        const result = await window.ace.selectPath();
        if (!result.canceled && result.path) {
            acePath.value = result.path;
            showStatus('路径已保存 ✓', true);
        }
    } catch (error) {
        showStatus('选择路径失败', false);
        console.error('选择路径失败:', error);
    }
}

// 手动输入后保存
async function handleSavePath() {
    if (!acePath.value.trim()) {
        showStatus('请输入路径', false);
        return;
    }
    try {
        await window.ace.setPath(acePath.value.trim());
        showStatus('路径已保存 ✓', true);
    } catch (error) {
        showStatus('保存失败', false);
        console.error('保存路径失败:', error);
    }
}

function handleManualInput() {
    statusMsg.value = '';
}

function showStatus(msg: string, success: boolean) {
    statusMsg.value = msg;
    isSuccess.value = success;
    setTimeout(() => {
        statusMsg.value = '';
    }, 3000);
}
</script>

<style scoped>
.ace {
    display: flex;
    flex-direction: column;
    padding: 16px;
}

h3 {
    margin: 0 0 8px 0;
    color: #2c3e50;
}

.desc {
    font-size: 13px;
    color: #666;
    margin: 0 0 4px 0;
    line-height: 1.5;
}

.hint {
    font-size: 12px;
    color: #999;
    margin: 0 0 16px 0;
    font-style: italic;
}

.path-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.path-row input {
    flex: 1;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-width: 0;
}

.path-row input:focus {
    outline: none;
    border-color: #3ca7ef;
}

.path-row button {
    padding: 8px 16px;
    background-color: #3ca7ef;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 14px;
}

.path-row button:hover {
    background-color: #2b96de;
}

.save-btn {
    background-color: #27ae60 !important;
}

.save-btn:hover {
    background-color: #219a52 !important;
}

.status {
    margin-top: 12px;
    font-size: 13px;
}

.success {
    color: #27ae60;
}

.error {
    color: #e74c3c;
}
</style>
