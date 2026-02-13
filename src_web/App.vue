<template>
    <div class="connection-status" :class="{ connected: isConnected }">
        {{ isConnected ? '✅ 已连接' : '❌ 未连接' }} ({{ connectionState }})
    </div>
    <home />
</template>

<script setup lang="ts">
import home from './page/Home.vue';
import { useLcuConnection } from './composables/useLcuConnection';

const { connectionState, isConnected } = useLcuConnection();
</script>

<style scoped>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    text-align: center;
    color: #2c3e50;
    margin-top: 60px;
}

h1 {
    font-size: 2em;
}
</style>
