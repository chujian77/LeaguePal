import { ref, onMounted, onUnmounted } from 'vue';

// 全局状态（单例模式）
const connectionState = ref<string>('disconnected');
const isConnected = ref<boolean>(false);
let unsubscribe: (() => void) | null = null;
let initialized = false;

export function useLcuConnection() {
    onMounted(async () => {
        // 只初始化一次
        if (!initialized) {
            initialized = true;

            // 获取初始状态
            const state = await window.lcu.getConnectionState();
            connectionState.value = state.state;
            isConnected.value = state.isConnected;

            // 监听状态变化
            unsubscribe = window.lcu.onConnectionStateChanged((newState) => {
                connectionState.value = newState.state;
                isConnected.value = newState.isConnected;
            });
        }
    });

    onUnmounted(() => {
        // 组件卸载时不取消监听，保持全局状态
    });

    return {
        connectionState,
        isConnected
    };
}
