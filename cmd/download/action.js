const END_POINT = 'END_POINT';
const NAVIGATE = 'NAVIGATE';
const DATA = 'DATA';
const DONE = 'DONE';
const ERROR = 'ERROR';

function create_action(type) {
  return function (payload) {
    if (payload !== undefined) {
      return {
        type,
        payload,
      };
    }
    return {
      type,
    };
  };
}

module.exports = {
  end_point: create_action(END_POINT),
  navigate: create_action(NAVIGATE),
  set_data: create_action(DATA),
  set_done: create_action(DONE),
  set_error: create_action(ERROR),
  END_POINT,
  NAVIGATE,
  DATA,
  DONE,
  ERROR,
};
