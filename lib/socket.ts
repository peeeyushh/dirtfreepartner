import { io } from 'socket.io-client';
import { Socket } from 'socket.io-client';


const IS_SOCKET_ENABLED = true; 


const SOCKET_URL = 'https://dirtfree-backend.onrender.com'; 

class SocketService {
  private socket: Socket | null = null;

  connect(token?: string) {
    if (!IS_SOCKET_ENABLED) {
      return;
    }

    if (this.socket) return;

    console.log('🔌 Attempting to connect to socket server:', SOCKET_URL);

    this.socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnectionAttempts: 5,
      timeout: 15000,
      forceNew: true,
      auth: {
        token: token
      }
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.log('⚠️ Socket Connection Error:', error.message);
    });
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: any) {
    if (!this.socket) return;
    this.socket.emit(event, data);
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }
}

export const socketService = new SocketService();


