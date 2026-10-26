'use client';
import {useState,useRef,useId,useEffect} from 'react';
import styles from './quick-guide.module.css';
export function Copy({text,label,compact=false}:{text:string;label:string;compact?:boolean}) {
  const [status,setStatus]=useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  async function copyText() {
    try { await navigator.clipboard.writeText(text); setStatus('已复制'); }
    catch { setStatus('复制失败，请选中文字手动复制'); }
  }
  useEffect(()=>setStatus(''),[text]);
  return <div className={compact ? styles.compactCopy : styles.copy}>
    <button className={compact ? styles.copyButton : styles.primary} onClick={copyText}>{label}</button>
    <span role="status">{status}</span>
    {!compact && <>
      <button className={styles.viewCommand} onClick={() => dialog.current?.showModal()}>查看完整指令</button>
      <dialog ref={dialog} className={styles.commandDialog} aria-labelledby={titleId} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
      }}>
        <header className={styles.dialogHeader}><div><h2 id={titleId}>{label.replace(/^复制/, '')}</h2><p>复制后粘贴到 AI 助手；终端命令请在对应终端执行。</p></div><button autoFocus className={styles.dialogClose} aria-label="关闭完整指令" onClick={() => dialog.current?.close()}>×</button></header>
        <pre className={styles.dialogCode} tabIndex={0}>{text}</pre>
        <footer className={styles.dialogFooter}><span role="status">{status || '完整内容，可选中复制'}</span><button className={styles.primary} onClick={copyText}>复制全部内容</button></footer>
      </dialog>
    </>}
  </div>;
}
