import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { colors, spacing, fontSize, fontWeight, radius, typography } from '../../theme';
import { api, ChatAgent, ChatMessage } from '../../services/api';
import { storage } from '../../services/storage';

// ─── Persistence helpers ────────────────────────────────────────────────────
const HISTORY_KEY = (agentId: string) => `chat_history_${agentId}`;

async function loadHistory(agentId: string): Promise<ChatMessage[]> {
  try {
    const raw = await storage.get(HISTORY_KEY(agentId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveHistory(agentId: string, msgs: ChatMessage[]) {
  const trimmed = msgs.slice(-50);
  await storage.set(HISTORY_KEY(agentId), JSON.stringify(trimmed));
}

// ─── Time formatting ────────────────────────────────────────────────────────
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { agentId } = useLocalSearchParams<{ agentId?: string }>();
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ChatAgent | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [buyUrl, setBuyUrl] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Fetch available agents
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getChatAgents();
        const allAgents = data.agents || [];
        setAgents(allAgents);

        if (agentId) {
          const target = allAgents.find(a => a.id === agentId);
          if (target) { setSelectedAgent(target); return; }
        }
        const running = allAgents.find(a => a.status === 'running');
        if (running) setSelectedAgent(running);
      } catch { /* silent */ }
      finally { setLoadingAgents(false); }
    })();
  }, [agentId]);

  // Load history + usage when agent changes
  useEffect(() => {
    if (!selectedAgent) return;
    (async () => {
      const history = await loadHistory(selectedAgent.id);
      setMessages(history);
    })();
    // Fetch usage quota
    (async () => {
      try {
        const usage = await api.getUsage();
        setRemaining(usage.remaining);
        setLimitReached(usage.remaining <= 0);
      } catch { /* non-fatal */ }
    })();
  }, [selectedAgent?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isTyping]);

  // ── Actions ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedAgent || isTyping) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsTyping(true);
    setError('');

    try {
      const res = await api.sendMessage(
        selectedAgent.id,
        userMsg.content,
        messages.slice(-20),
      );

      const assistantMsg: ChatMessage = { role: 'assistant', content: res.reply };
      const final = [...updated, assistantMsg];
      setMessages(final);
      await saveHistory(selectedAgent.id, final);

      // Update remaining count
      if (res.remaining !== undefined) {
        setRemaining(res.remaining);
        setLimitReached(res.remaining <= 0);
      }
    } catch (e: any) {
      if (e.code === 'message_limit_reached') {
        setLimitReached(true);
        setRemaining(0);
        if (e.buyUrl) setBuyUrl(e.buyUrl);
        setError(e.userMessage || "You've used all your messages this month.");
      } else {
        setError(e.message || 'Failed to send');
      }
      setMessages(messages); // revert optimistic update
    } finally {
      setIsTyping(false);
    }
  }, [input, selectedAgent, messages, isTyping]);

  const handleClearChat = () => {
    if (!selectedAgent || messages.length === 0) return;
    Alert.alert(
      'Clear Conversation',
      `Clear all messages with ${selectedAgent.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: async () => {
            setMessages([]);
            await storage.remove(HISTORY_KEY(selectedAgent.id));
          },
        },
      ],
    );
  };

  const handleCopyMessage = async (text: string, index: number) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      // On native, fall back to deprecated RN Clipboard if available
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch { /* silent */ }
  };

  const selectAgent = (agent: ChatAgent) => {
    setSelectedAgent(agent);
    setShowPicker(false);
    setError('');
  };

  // ─── No agents state ───────────────────────────────────────────────────
  if (!loadingAgents && agents.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={28} color={colors.text.muted} />
          <Text style={styles.emptyTitle}>No agents available</Text>
          <Text style={styles.emptyText}>
            Deploy an agent first, then chat with it here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Helper: should show timestamp ────────────────────────────────────
  // Show timestamp after every pair (user + assistant) or every 2 messages
  const shouldShowTimestamp = (index: number): boolean => {
    if (index === messages.length - 1) return true; // Always on last message
    // Show after assistant messages (end of a turn)
    if (messages[index].role === 'assistant') return true;
    return false;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with agent selector + clear button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.agentSelector}
          onPress={() => setShowPicker(!showPicker)}
          activeOpacity={0.7}
        >
          <View style={styles.agentDot} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selectedAgent?.name || 'Select agent'}
          </Text>
          <Ionicons
            name={showPicker ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.text.muted}
          />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {remaining !== null && (
            <View style={[styles.remainingBadge, remaining <= 10 && styles.remainingBadgeLow]}>
              <Text style={[styles.remainingText, remaining <= 10 && styles.remainingTextLow]}>
                {remaining} left
              </Text>
            </View>
          )}
          {messages.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClearChat}
              activeOpacity={0.6}
            >
              <Ionicons name="trash-outline" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          )}
          <View style={styles.modelBadge}>
            <Text style={styles.modelText}>Opus</Text>
          </View>
        </View>
      </View>

      {/* Agent picker dropdown */}
      {showPicker && (
        <View style={styles.picker}>
          {agents.map(agent => (
            <TouchableOpacity
              key={agent.id}
              style={[
                styles.pickerItem,
                selectedAgent?.id === agent.id && styles.pickerItemActive,
              ]}
              onPress={() => selectAgent(agent)}
              activeOpacity={0.6}
            >
              <View style={[
                styles.pickerDot,
                agent.status === 'running' && styles.pickerDotLive,
              ]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerName}>{agent.name}</Text>
                <Text style={styles.pickerMeta}>{agent.status}</Text>
              </View>
              {selectedAgent?.id === agent.id && (
                <Ionicons name="checkmark" size={16} color={colors.accent.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 && !isTyping && (
            <View style={styles.chatEmpty}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.text.muted} />
              <Text style={styles.chatEmptyText}>
                Start a conversation with {selectedAgent?.name || 'your agent'}
              </Text>
            </View>
          )}

          {messages.map((msg, i) => (
            <View key={i}>
              <TouchableOpacity
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
                onLongPress={() => handleCopyMessage(msg.content, i)}
                activeOpacity={0.8}
                delayLongPress={400}
              >
                <Text style={[
                  styles.bubbleText,
                  msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant,
                ]}>
                  {msg.content}
                </Text>
                {/* Copied indicator */}
                {copiedIndex === i && (
                  <View style={styles.copiedBadge}>
                    <Ionicons name="checkmark" size={10} color={colors.status.success} />
                    <Text style={styles.copiedText}>Copied</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Timestamp after assistant replies */}
              {shouldShowTimestamp(i) && (
                <Text style={[
                  styles.timestamp,
                  msg.role === 'user' ? styles.timestampRight : styles.timestampLeft,
                ]}>
                  {formatTime(new Date())}
                </Text>
              )}
            </View>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <View style={styles.typingRow}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, { opacity: 0.6 }]} />
                <View style={[styles.typingDot, { opacity: 0.3 }]} />
              </View>
            </View>
          )}

          {/* Limit reached banner */}
          {limitReached && (
            <View style={styles.limitBanner}>
              <Ionicons name="lock-closed" size={18} color={colors.accent.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.limitTitle}>Message limit reached</Text>
                <Text style={styles.limitDesc}>
                  You've used all 200 messages this month. Buy more to continue chatting.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.buyBtn}
                onPress={() => {
                  const url = buyUrl || 'https://primisprotocol.ai/aibuilder?tab=moltbot&buy=messages';
                  Linking.openURL(url).catch(() => {});
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.buyBtnText}>Buy More</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Generic error (non-limit) */}
          {error && !limitReached ? (
            <View style={styles.errorBubble}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.status.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={limitReached ? 'Message limit reached' : selectedAgent ? 'Message...' : 'Select an agent first'}
            placeholderTextColor={limitReached ? colors.status.error : colors.text.muted}
            editable={!!selectedAgent && !isTyping && !limitReached}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isTyping || !selectedAgent || limitReached}
            activeOpacity={0.7}
          >
            {isTyping ? (
              <ActivityIndicator size="small" color={colors.bg.primary} />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.bg.primary} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  agentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  agentDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.status.success,
  },
  headerTitle: {
    fontSize: fontSize.md, color: colors.text.primary,
    fontWeight: fontWeight.semibold, letterSpacing: -0.2, flex: 1,
  },
  headerRight: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  clearBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border.default,
  },
  remainingBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.bg.card, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border.default,
  },
  remainingBadgeLow: {
    borderColor: colors.status.error, backgroundColor: colors.status.errorDim,
  },
  remainingText: {
    fontSize: 10, color: colors.text.tertiary, fontWeight: fontWeight.medium,
  },
  remainingTextLow: {
    color: colors.status.error,
  },
  modelBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.bg.card, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border.default,
  },
  modelText: {
    fontSize: 10, color: colors.text.tertiary, fontWeight: fontWeight.medium,
  },

  // Picker
  picker: {
    backgroundColor: colors.bg.card, borderBottomWidth: 1,
    borderBottomColor: colors.border.default, paddingVertical: spacing.xs,
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md,
  },
  pickerItemActive: { backgroundColor: colors.accent.dim },
  pickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text.muted },
  pickerDotLive: { backgroundColor: colors.status.success },
  pickerName: { fontSize: fontSize.base, color: colors.text.primary, fontWeight: fontWeight.medium },
  pickerMeta: { fontSize: fontSize.xs, color: colors.text.muted, marginTop: 1 },

  // Empty states
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing['2xl'], gap: spacing.md, marginBottom: 80,
  },
  emptyTitle: { fontSize: fontSize.md, color: colors.text.secondary, fontWeight: fontWeight.medium },
  emptyText: {
    fontSize: fontSize.base, color: colors.text.muted,
    textAlign: 'center', lineHeight: 20, maxWidth: 260,
  },
  chatEmpty: { alignItems: 'center', gap: spacing.sm, paddingTop: 80 },
  chatEmptyText: {
    fontSize: fontSize.sm, color: colors.text.muted,
    textAlign: 'center', maxWidth: 240, lineHeight: 18,
  },

  // Messages
  messagesScroll: { flex: 1 },
  messagesContent: {
    padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.xs,
  },
  bubble: {
    maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: colors.accent.primary, borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start', backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border.default, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: fontSize.base, lineHeight: 20 },
  bubbleTextUser: { color: colors.bg.primary },
  bubbleTextAssistant: { color: colors.text.primary },

  // Copied badge
  copiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: 4,
  },
  copiedText: {
    fontSize: 9, color: colors.status.success, fontWeight: fontWeight.medium,
  },

  // Timestamps
  timestamp: {
    fontSize: 9, color: colors.text.muted, marginTop: 2, marginBottom: spacing.sm,
  },
  timestampLeft: { alignSelf: 'flex-start', marginLeft: 4 },
  timestampRight: { alignSelf: 'flex-end', marginRight: 4 },

  // Typing indicator
  typingRow: { flexDirection: 'row', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text.muted },

  // Limit reached banner
  limitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.base, marginTop: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.accent.primary + '40',
  },
  limitTitle: {
    fontSize: fontSize.sm, color: colors.text.primary,
    fontWeight: fontWeight.semibold, marginBottom: 2,
  },
  limitDesc: {
    fontSize: fontSize.xs, color: colors.text.muted, lineHeight: 16,
  },
  buyBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.accent.primary, borderRadius: radius.md,
  },
  buyBtnText: {
    fontSize: fontSize.xs, color: colors.bg.primary,
    fontWeight: fontWeight.semibold,
  },

  // Error
  errorBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.sm, backgroundColor: colors.status.errorDim,
  },
  errorText: { fontSize: fontSize.sm, color: colors.status.error },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border.default,
    backgroundColor: colors.bg.secondary,
  },
  textInput: {
    flex: 1, minHeight: 38, maxHeight: 100,
    backgroundColor: colors.bg.input, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border.default,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: fontSize.base, color: colors.text.primary, lineHeight: 20,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accent.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
});
