<template>
    <div class="container">
        <!-- 已连接：显示召唤师信息 -->
        <div v-if="isConnected" class="profile">
            <div class="icon">
                <img :src="imgUrl" alt="头像" />
            </div>
            <div class="level">
                <span>{{ `等级：${profile?.summonerLevel}` }}</span>
            </div>
            <div class="gameName">
                <span>{{ profile?.gameName }}</span>
            </div>
        </div>

        <!-- 未连接：显示提示信息 -->
        <div v-else class="disconnected">
            <div class="icon">🎮</div>
            <p>请启动英雄联盟客户端</p>
            <p class="hint">等待连接中...</p>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, watch } from 'vue';
import { useLcuConnection } from '../composables/useLcuConnection';

// 获取连接状态
const { isConnected } = useLcuConnection();

// 使用 ref 存储异步数据
const profile = ref<any>(null);
const imgUrl = ref('');

// 获取召唤师信息的函数
async function fetchProfile() {
    try {
        const res = await window.lcu.getProfile();
        profile.value = res.data;
        console.log('Current Summoner Profile:', res);

        if (res?.data?.profileIconId) {
            imgUrl.value = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${res.data.profileIconId}.jpg`;
        }
    } catch (error) {
        console.error('获取召唤师信息失败:', error);
    }
}

// 监听连接状态变化，连接时自动获取数据
watch(isConnected, (connected) => {
    if (connected) {
        fetchProfile();
    } else {
        // 断开连接时清空数据
        profile.value = null;
        imgUrl.value = '';
    }
}, { immediate: true });
</script>

<style scoped>
.container {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    text-align: center;
}

.profile .icon {
    width: 100px;
    height: 100px;
    background-color: gray;
    border-radius: 50%;
    overflow: hidden;
    margin: 0 auto;
}

.profile .icon img {
    width: 100%;
    height: 100%;
    /* object-fit: cover; */
}

.disconnected .icon {
    font-size: 48px;
    margin-bottom: 16px;

}

.disconnected .hint {
    color: #888;
    font-size: 14px;
}
</style>
