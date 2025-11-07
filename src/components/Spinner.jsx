import PropTypes from 'prop-types';
import clsx from 'clsx';

function Spinner({ light = false, className }) {
  return <div className={clsx('spinner', light && 'spinner-light', className)} />;
}

Spinner.propTypes = {
  light: PropTypes.bool,
  className: PropTypes.string,
};

export default Spinner;
