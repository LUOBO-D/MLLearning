import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page not-found">
      <span>404 / LOST IN MODEL SPACE</span>
      <strong>偏离了学习路径。</strong>
      <p>这个页面不存在，但你的学习记录都还在。</p>
      <Link to="/today" className="button button--primary"><ArrowLeft size={17} />返回今日学习</Link>
    </div>
  );
}
