import EventEmitter from 'events';
import { Box, Text } from 'ink';
import React, { useEffect, useReducer } from 'react';
import { DownloadInit, DownloadProgress } from '../types';

const GridCell = ({ status }: { status: number }) => {
  switch (status) {
    case 0:
      return <Text color="gray"> ○</Text>;
    case 1:
      return <Text color="greenBright"> ●</Text>;
    case 2:
      return <Text color="redBright"> ●</Text>;
  }
  return <Text color="yellowBright"> ●</Text>;
};

type GridState = {
  bit: number[];
  title: string;
  index: number;
  init: boolean;
};

type Action =
  | { type: 'progress'; payload: DownloadProgress }
  | { type: 'init'; payload: { total: number } }
  | { type: 'fail'; payload: number };

function reducer(state: GridState, action: Action): GridState {
  switch (action.type) {
    case 'progress':
      const { index, title } = action.payload;
      return {
        bit: state.bit.map((v, i) => (i === index ? 1 : v)),
        index,
        title,
        init: state.init,
      };
    case 'init':
      const { total } = action.payload;
      return {
        bit: new Array(total).fill(0),
        index: state.index,
        title: state.title,
        init: true,
      };
    case 'fail':
      return { ...state, bit: state.bit.map((v, i) => (i === action.payload ? 2 : v)) };
    default:
      return state;
  }
}

export const Grid = ({ subject }: { subject: EventEmitter }) => {
  const [state, dispatch] = useReducer(reducer, {
    bit: [],
    title: '',
    index: -1,
    init: false,
  });

  function progress(p: DownloadProgress) {
    dispatch({
      type: 'progress',
      payload: p,
    });
  }

  function init(p: DownloadInit) {
    dispatch({
      type: 'init',
      payload: p,
    });
  }

  function fail(p: number) {
    dispatch({
      type: 'fail',
      payload: p,
    });
  }

  useEffect(() => {
    subject.on('progress', progress);
    subject.on('init', init);
    subject.on('fail', fail);

    return () => {
      subject.removeListener('progress', progress);
      subject.removeListener('init', init);
      subject.removeListener('fail', fail);
    };
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-around" borderColor="blue" borderStyle="double">
        <Text>
          <Text color="greenBright">●</Text> - success
        </Text>
        <Text>
          <Text color="gray">○</Text> - pending
        </Text>
        <Text>
          <Text color="redBright">●</Text> - error
        </Text>
      </Box>
      <Box borderColor="yellowBright" paddingX={1}>
        {state.init ? (
          <Text>
            {state.bit.map((v, i) => (
              <GridCell key={i} status={v} />
            ))}
          </Text>
        ) : (
          <Text>initializing...</Text>
        )}
      </Box>
    </Box>
  );
};
