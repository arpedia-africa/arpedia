import { View } from 'react-native';
import { useTheme } from '@arpedia/ui';
import { Bubble, DayMarker, type BubbleView } from '../06/ChatViews';
import {
  CreateRoomBody,
  CreateRoomFoot,
  CreateRoomHero,
  JoinCodeBody,
  JoinCodeFoot,
  JoinCodeHero,
} from './FormViews';
import { RoomList, RoomsHero, RoomsSectionHead, type RoomRowView } from './RoomsViews';
import { RoomComposer, RoomHead, RoomTabs, SpoilerBubble, type MemberChip } from './RoomViews';

// Pixel-gate pages for flow 07 with the prototype's values (tools/parity/s-*.html); the parity
// screen in app/parity.tsx renders these.

export const FLOW07 = new Set<string>(['s-rooms', 's-create-room', 's-join-code', 's-room']);

const noop = () => {};

const ROOMS: RoomRowView[] = [
  {
    id: 'hl',
    name: 'Harmattan Letters Read-Along',
    book: 'Harmattan Letters',
    tone: 'c1',
    members: '6 members · 3 finished',
    active: 'Active today',
    percent: 34,
    unread: false,
  },
  {
    id: 'sg',
    name: 'Sunday Grace Circle',
    book: 'The Alignment',
    tone: 'c3',
    members: '8 members · 1 finished',
    active: 'Active yesterday',
    percent: 72,
    unread: false,
  },
  {
    id: 'jb',
    name: 'Jos Book Night',
    book: 'Seven Bridges to Jos',
    tone: 'c4',
    members: '5 members · starts Monday',
    active: 'Starts Monday',
    percent: 0,
    unread: false,
  },
];

const BOOKS = [
  { id: 'b1', title: 'Harmattan Letters', tone: 'c1' as const },
  { id: 'b2', title: 'The Alignment', tone: 'c3' as const },
  { id: 'b3', title: 'Still Waters, Lagos', tone: 'c2' as const },
  { id: 'b4', title: 'Psalms for the Danfo', tone: 'c7' as const },
];

const CHIPS: MemberChip[] = [
  { id: 'ne', name: 'Ngozi Eze', label: 'You · 72%', tone: 'g', percent: 72 },
  { id: 'ko', name: 'Kemi Ogunleye', label: 'Kemi · 81%', tone: 't', percent: 81 },
  { id: 'ea', name: 'Emeka Adebayo', label: 'Emeka · 55%', tone: 'r', percent: 55 },
  { id: 'bl', name: 'Bisi Lawal', label: 'Bisi · done', tone: 'k', percent: 100 },
  { id: 'zu', name: 'Zainab Umar', label: 'Zainab · 30%', tone: 'o', percent: 30 },
];

const KEMI: BubbleView = {
  key: 'm1',
  me: false,
  senderName: 'Kemi',
  senderTone: 't',
  author: false,
  body: 'How did he know her name?? 😳',
  quote: { text: 'Chapter 14 · “He had prayed for her by name.”', source: '' },
  time: '16:40',
};
const ME: BubbleView = {
  key: 'm3',
  me: true,
  senderName: 'Ngozi Eze',
  senderTone: 'g',
  author: false,
  body: "I'm on 13, don't spoil me Bisi!",
  time: '17:01',
};

export function Flow07({ page }: { page: string }) {
  const { c, s } = useTheme();
  if (page === 's-rooms')
    return (
      // .body.body-end: padding-bottom 28
      <View style={{ paddingBottom: s(28) }}>
        <RoomsHero onBack={noop} onCreate={noop} onJoin={noop} />
        <View style={{ paddingTop: s(24) }}>
          <RoomsSectionHead title="Your rooms" count={3} />
          <RoomList rows={ROOMS} onOpen={noop} />
        </View>
      </View>
    );
  if (page === 's-create-room')
    return (
      <>
        <CreateRoomHero onClose={noop} />
        <CreateRoomBody
          values={{ name: 'Office Ladies Book Club', book: 'b1', pace: 'three_week', join: 'code' }}
          onChange={noop}
          books={BOOKS}
          paceHint="Finishes around 28 December"
        />
        <CreateRoomFoot enabled onCreate={noop} />
      </>
    );
  if (page === 's-join-code')
    return (
      <>
        <JoinCodeHero onClose={noop} />
        <JoinCodeBody code="GRACE24" onChange={noop} onPaste={noop} focused />
        <JoinCodeFoot filled={7} onJoin={noop} />
      </>
    );
  return (
    <>
      <RoomHead
        name="Sunday Grace Circle"
        book="The Alignment"
        code="GRACE24A"
        tone="c3"
        members={CHIPS}
        onBack={noop}
        onShare={noop}
      />
      <RoomTabs active="chat" onChange={noop} locked members={8} />
      {/* .chat: gap 10, padding 14 12 */}
      <View
        style={{ gap: s(10), paddingVertical: s(14), paddingHorizontal: s(12), backgroundColor: c.white }}
      >
        <DayMarker label="Sunday" />
        <Bubble m={KEMI} />
        <SpoilerBubble name="Bisi" tone="k" chapter={22} time="16:52" onReveal={noop} />
        <Bubble m={ME} />
      </View>
      <RoomComposer value="" onChange={noop} onSend={noop} bottom={s(24)} />
    </>
  );
}
