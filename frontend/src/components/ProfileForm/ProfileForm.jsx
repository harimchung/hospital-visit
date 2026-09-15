import { useState } from 'react'
import './ProfileForm.css'

const emptyForm = {
  nickname: '',
  age: '',
  gender: '',
  conditions: '',
}

export default function ProfileForm({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm)

  if (!open) return null

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const nickname = form.nickname.trim()
    const age = Number(form.age)
    if (!nickname || !form.gender || Number.isNaN(age) || age < 0 || age > 130) return

    onSubmit({
      id: crypto.randomUUID(),
      nickname,
      age,
      gender: form.gender,
      conditions: form.conditions.trim(),
    })
    setForm(emptyForm)
  }

  return (
    <div className="confirm-overlay" onClick={onClose} role="presentation">
      <form
        className="confirm-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="confirm-content">
          <h2 className="confirm-title">프로필 추가</h2>

          <label className="profile-field">
            닉네임
            <input value={form.nickname} onChange={set('nickname')} required />
          </label>
          <label className="profile-field">
            만 나이
            <input
              type="number"
              min="0"
              max="130"
              value={form.age}
              onChange={set('age')}
              required
            />
          </label>
          <fieldset className="profile-field">
            <legend>성별</legend>
            <label><input type="radio" name="gender" value="female" checked={form.gender === 'female'} onChange={set('gender')} /> 여</label>
            <label><input type="radio" name="gender" value="male" checked={form.gender === 'male'} onChange={set('gender')} /> 남</label>
            <label><input type="radio" name="gender" value="other" checked={form.gender === 'other'} onChange={set('gender')} /> 기타</label>
          </fieldset>
          <label className="profile-field">
            기저질환
            <input
              value={form.conditions}
              onChange={set('conditions')}
              placeholder="없으면 비워 둬도 돼요"
            />
          </label>

          <div className="confirm-actions">
            <button type="button" className="confirm-btn confirm-btn--cancel" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="confirm-btn confirm-btn--primary">
              추가
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
