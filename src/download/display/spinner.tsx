import EventEmitter from 'events';
import { Box, Text } from 'ink';
import React, { useEffect, useReducer } from 'react';

import { DownloadInit, DownloadProgress } from '../types';

const SPINNER_GRAPH = '←↖↑↗→↘↓↙';

type SpinnerState = {
  spin: number;
  total: number;
  title: string;
  index: number;
};

type Action =
  | { type: 'progress'; payload: DownloadProgress }
  | { type: 'init'; payload: { total: number } };

function reducer(state: SpinnerState, action: Action): SpinnerState {
  switch (action.type) {
    case 'progress':
      const { index, title } = action.payload;
      return { ...state, spin: (state.spin + 1) % SPINNER_GRAPH.length, index, title };
    case 'init':
      const { total } = action.payload;
      return { ...state, total };
    default:
      return state;
  }
}

export const Spinner = ({ subject }: { subject: EventEmitter }) => {
  const [state, dispatch] = useReducer(reducer, {
    spin: 0,
    total: -1,
    title: '',
    index: -1,
  });

  function listener(p: DownloadProgress) {
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

  useEffect(() => {
    subject.on('init', init);
    subject.on('progress', listener);

    return () => {
      subject.removeListener('progress', listener);
      subject.removeListener('init', init);
    };
  }, [subject]);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="greenBright">{SPINNER_GRAPH[state.spin]} </Text>
        <Text color="greenBright">
          [{state.index + 1}/{state.total}]
        </Text>
        <Text>{state.title}</Text>
      </Text>
    </Box>
  );
};
